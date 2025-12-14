import json
import boto3
import os
import time

transcribe = boto3.client('transcribe')
dynamodb = boto3.resource('dynamodb')

TABLE_NAME = os.environ['TABLE_NAME']
BUCKET_NAME = os.environ['BUCKET_NAME']

def lambda_handler(event, context):

    params = event.get('queryStringParameters') or {}
    file_name = params.get('filename')

    if not file_name:
        return {"statusCode": 400, "body": "Missing filename"}

    job_name = f"transcribe-{int(time.time())}"
    s3_uri = f"s3://{BUCKET_NAME}/{file_name}"

    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={'MediaFileUri': s3_uri},
        MediaFormat='mp3',
        LanguageCode='en-US'
    )

    table = dynamodb.Table(TABLE_NAME)
    table.put_item(Item={
        'FileName': file_name,
        'JobName': job_name,
        'Status': 'STARTED',
        'Timestamp': int(time.time())
    })

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Transcription started",
            "job_name": job_name
        })
    }
