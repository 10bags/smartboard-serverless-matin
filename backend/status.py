import json
import boto3
import os
import urllib.request

transcribe = boto3.client('transcribe')
dynamodb = boto3.resource('dynamodb')

TABLE = os.environ['TABLE_NAME']

def lambda_handler(event, context):
    job_name = event['queryStringParameters']['job']
    table = dynamodb.Table(TABLE)

    response = transcribe.get_transcription_job(
        TranscriptionJobName=job_name
    )

    status = response['TranscriptionJob']['TranscriptionJobStatus']

    if status == "COMPLETED":
        uri = response['TranscriptionJob']['Transcript']['TranscriptFileUri']
        data = json.loads(urllib.request.urlopen(uri).read())
        transcript = data['results']['transcripts'][0]['transcript']

        table.update_item(
            Key={'JobName': job_name},
            UpdateExpression="SET #s=:s, Transcript=:t",
            ExpressionAttributeNames={"#s": "Status"},
            ExpressionAttributeValues={
                ":s": "COMPLETED",
                ":t": transcript
            }
        )

        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"status": "COMPLETED", "text": transcript})
        }

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"status": status})
    }
