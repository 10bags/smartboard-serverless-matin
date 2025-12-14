import json
import boto3
import time

dynamodb = boto3.resource('dynamodb')
transcribe = boto3.client('transcribe')

TABLE_NAME = "Transcriptions"
BUCKET_NAME = "smartboard-audio-matin09-858039354211"

def lambda_handler(event, context):
    params = event.get("queryStringParameters") or {}
    file_name = params.get("filename")

    if not file_name:
        return {"statusCode": 400, "body": "Missing filename"}

    s3_uri = f"s3://{BUCKET_NAME}/{file_name}"
    job_name = f"transcription-{int(time.time())}"

    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": s3_uri},
        MediaFormat="mp3",
        LanguageCode="en-US"
    )

    table = dynamodb.Table(TABLE_NAME)
    table.put_item(
        Item={
            "FileName": file_name,
            "JobName": job_name,
            "Status": "IN_PROGRESS",
            "Timestamp": str(int(time.time()))
        }
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Transcription started",
            "job": job_name
        })
    }
