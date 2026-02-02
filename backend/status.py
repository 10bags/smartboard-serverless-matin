import json
import boto3
import os
import urllib.request
from botocore.exceptions import ClientError

transcribe = boto3.client('transcribe')
translate = boto3.client('translate')
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client(service_name='bedrock-runtime', region_name='us-east-1') 

TABLE = os.environ['TABLE_NAME']

# Helper to provide consistent CORS headers
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
}

def lambda_handler(event, context):
    try:
        job_name = event['queryStringParameters']['job']
    except (TypeError, KeyError):
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Missing 'job' parameter."})
        }
        
    table = dynamodb.Table(TABLE)

    try:
        response = transcribe.get_transcription_job(TranscriptionJobName=job_name)
    except ClientError:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"status": "ERROR"})
        }

    status = response['TranscriptionJob']['TranscriptionJobStatus']

    if status == "COMPLETED":
        uri = response['TranscriptionJob']['Transcript']['TranscriptFileUri']
        data = json.loads(urllib.request.urlopen(uri).read())
        
        # Diarization Logic
        if 'speaker_labels' in data['results']:
            raw_transcript = ""
            segments = data['results']['speaker_labels']['segments']
            items = data['results']['items']
            for segment in segments:
                speaker_label = segment['speaker_label']
                start_time = float(segment['start_time'])
                end_time = float(segment['end_time'])
                words = [item['alternatives'][0]['content'] for item in items if item.get('start_time') and float(item['start_time']) >= start_time and float(item['end_time']) <= end_time]
                if words:
                    raw_transcript += f"{speaker_label}: {''.join(words)}\n"
        else:
            raw_transcript = data['results']['transcripts'][0]['transcript']

        # Translation
        translation = translate.translate_text(Text=raw_transcript, SourceLanguageCode='zh', TargetLanguageCode='en')
        translated_text = translation['TranslatedText']

        # Bedrock To-Do List
        todo_list = "No tasks found."
        try:
            prompt = f"Extract a bulleted To-Do list from this transcript:\n{translated_text}"
            payload = {"anthropic_version": "bedrock-2023-05-31", "max_tokens": 500, "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}]}
            bedrock_res = bedrock.invoke_model(modelId='anthropic.claude-3-5-sonnet-20240620-v1:0', body=json.dumps(payload))
            todo_list = json.loads(bedrock_res.get('body').read())['content'][0]['text']
        except:
            pass

        # Update DynamoDB
        table.update_item(
            Key={'JobName': job_name},
            UpdateExpression="SET #s=:s, TranslatedTranscript=:t, TodoList=:todo",
            ExpressionAttributeNames={"#s": "Status"},
            ExpressionAttributeValues={":s": "COMPLETED", ":t": translated_text, ":todo": todo_list}
        )

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "status": "COMPLETED", 
                "text": translated_text, 
                "todo_list": todo_list
            })
        }
    
    # Return status for IN_PROGRESS or FAILED
    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({"status": status})
    }
