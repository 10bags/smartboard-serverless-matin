import json
import boto3
import os
import urllib.request
from botocore.exceptions import ClientError

transcribe = boto3.client('transcribe')
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
        transcript = data['results']['transcripts'][0]['transcript']

        # 3. Update DynamoDB
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