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
        body = json.loads(event["body"])
        audio_bytes = base64.b64decode(body["audio"])
    except Exception as e:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Invalid request body"})
        }

    file_name = f"audio-{int(time.time())}.wav"
    job_name = f"job-{int(time.time())}"

    # Upload to S3
    s3.put_object(
        Bucket=BUCKET,
        Key=file_name,
        Body=audio_bytes,
        ContentType="audio/wav"
    )

    # Start Transcribe job
    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": f"s3://{BUCKET}/{file_name}"},
        MediaFormat="wav",
        LanguageCode="en-US"
    )

    # Save job to DynamoDB
    table = dynamodb.Table(TABLE)
    table.put_item(Item={
        "JobName": job_name,
        "FileName": file_name,
        "Status": "IN_PROGRESS"
    })

    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST"
        },
        "body": json.dumps({"jobName": job_name})
    }
