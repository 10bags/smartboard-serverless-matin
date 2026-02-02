import json
import boto3
import os
import base64
import time

s3 = boto3.client("s3")
transcribe = boto3.client("transcribe")
dynamodb = boto3.resource("dynamodb")

BUCKET = os.environ["BUCKET_NAME"]
TABLE = os.environ["TABLE_NAME"]

def lambda_handler(event, context):
    try:
        # Check for 'body' in event, which is typical for API Gateway POST
        if 'body' not in event or not event['body']:
            raise ValueError("Missing request body")
            
        body = json.loads(event["body"])
        # Expecting Base64 encoded audio string
        audio_bytes = base64.b64decode(body["audio"]) 
    except Exception as e:
        print(f"Error parsing body or decoding audio: {e}")
        return {
            "statusCode": 400,
            # CORS header must still be included in the response payload
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": f"Invalid request body: {str(e)}"})
        }

    file_name = f"audio-{int(time.time())}.wav"
    job_name = f"job-{int(time.time())}"

    # 1. Upload to S3
    s3.put_object(
        Bucket=BUCKET,
        Key=file_name,
        Body=audio_bytes,
        ContentType="audio/wav"
    )

    # 2. Start Transcribe job
    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": f"s3://{BUCKET}/{file_name}"},
        MediaFormat="wav",
        LanguageCode="zh-CN",
        Settings={
            'ShowSpeakerLabels': True,
            'MaxSpeakerLabels': 10  # Set this to the max people expected in the room
        }
    )

    table = dynamodb.Table(TABLE)
    table.put_item(Item={
        "JobName": job_name,
        "FileName": file_name,
        "Status": "IN_PROGRESS"
    })


    return {
        "statusCode": 200,
        # CORS header must still be included in the response payload
        "headers": {"Access-Control-Allow-Origin": "*"},
        # Simplified response body
        "body": json.dumps({"jobName": job_name})
    }
