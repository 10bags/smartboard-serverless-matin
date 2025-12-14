import json
import boto3
import time

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
transcribe = boto3.client('transcribe')

TABLE_NAME = "Transcriptions"
BUCKET_NAME = "smartboard-audio-10bags"

def lambda_handler(event, context):
    # Get filename from query parameter
    file_name = event.get('queryStringParameters', {}).get('filename')
    if not file_name:
        return {"statusCode": 400, "body": "Missing filename"}

    s3_uri = f"s3://{BUCKET_NAME}/{file_name}"

    # Start transcription job
    job_name = f"TranscribeJob-{int(time.time())}"
    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={'MediaFileUri': s3_uri},
        MediaFormat='mp3',  # or wav
        LanguageCode='en-US'
    )

    # Poll until transcription is COMPLETE
    while True:
        status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
        job_status = status['TranscriptionJob']['TranscriptionJobStatus']
        if job_status in ['COMPLETED', 'FAILED']:
            break
        time.sleep(5)  # wait 5 seconds before checking again

    if job_status == 'FAILED':
        return {"statusCode": 500, "body": "Transcription failed"}

    # Get the transcript URL
    transcript_file_uri = status['TranscriptionJob']['Transcript']['TranscriptFileUri']

    # Store in DynamoDB
    table = dynamodb.Table(TABLE_NAME)
    table.put_item(Item={
        'FileName': file_name,
        'TranscriptionText': transcript_file_uri,
        'Timestamp': str(int(time.time()))
    })

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Transcription completed",
            "transcript_uri": transcript_file_uri
        })
    }
