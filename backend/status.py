import json
import boto3
import os
import urllib.request
from botocore.exceptions import ClientError

transcribe = boto3.client('transcribe')
translate = boto3.client('translate') # Initialized for translation service
dynamodb = boto3.resource('dynamodb')

TABLE = os.environ['TABLE_NAME']

def lambda_handler(event, context):
    try:
        # Get job name from query string parameters
        job_name = event['queryStringParameters']['job']
    except (TypeError, KeyError):
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Missing 'job' query parameter."})
        }
        
    table = dynamodb.Table(TABLE)

    try:
        response = transcribe.get_transcription_job(
            TranscriptionJobName=job_name
        )
    except ClientError as e:
        print(f"Transcribe Client Error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"status": "ERROR", "text": "Could not retrieve Transcribe job status."})
        }

    status = response['TranscriptionJob']['TranscriptionJobStatus']

    if status == "COMPLETED":
        # 1. Get URI for the transcript file
        uri = response['TranscriptionJob']['Transcript']['TranscriptFileUri']
        
        # 2. Download and parse the transcript JSON
        data = json.loads(urllib.request.urlopen(uri).read())
        
        # This is the raw transcript (Mandarin + English)
        raw_transcript = data['results']['transcripts'][0]['transcript'] 
        
        # --- NEW: Call Amazon Translate to unify the text in English ---
        translation_response = translate.translate_text(
            Text=raw_transcript,
            SourceLanguageCode='auto', # Auto-detects the mix of English/Mandarin
            TargetLanguageCode='en'   # Translates everything to English
        )
        translated_transcript = translation_response['TranslatedText']
        
        # 3. Update DynamoDB with BOTH transcripts
        table.update_item(
            Key={'JobName': job_name},
            # Store the original mixed text and the translated text
            UpdateExpression="SET #s=:s, RawTranscript=:raw, TranslatedTranscript=:translated", 
            ExpressionAttributeNames={"#s": "Status"},
            ExpressionAttributeValues={
                ":s": "COMPLETED",
                ":raw": raw_transcript,
                ":translated": translated_transcript
            }
        )

        # 4. Return BOTH texts to the frontend
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            # Return the translated text as 'text' for backward compatibility, and the raw text as 'raw_text'
            "body": json.dumps({"status": "COMPLETED", "text": translated_transcript, "raw_text": raw_transcript})
        }
    
    elif status == "FAILED":
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"status": status, "text": response['TranscriptionJob'].get('FailureReason', 'Unknown failure.')})
        }

    # Status is IN_PROGRESS or QUEUED
    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"status": status})
    }