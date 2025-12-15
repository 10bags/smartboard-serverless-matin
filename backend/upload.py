import json
import boto3
import os
import time

s3 = boto3.client('s3')
transcribe = boto3.client('transcribe')
dynamodb = boto3.resource('dynamodb')

BUCKET = os.environ['BUCKET_NAME']
TABLE = os.environ['TABLE_NAME']

def lambda_handler(event, context):
    body = json.loads(event['body'])
    file_name = body['filename']

    job_name = f"job-{int(time.time())}"
    s3_uri = f"s3://{BUCKET}/{file_name}"

    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={'MediaFileUri': s3_uri},
        MediaFormat='webm',
        LanguageCode='en-US'
    )

    table = dynamodb.Table(TABLE)
    table.put_item(Item={
        'JobName': job_name,
        'FileName': file_name,
        'Status': 'IN_PROGRESS'
    })

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"jobName": job_name})
    }
