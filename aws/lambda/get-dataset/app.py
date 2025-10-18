"""Returns a JSON object with every image in the s3 bucket, from dynamodb table"""
import json

def lambda_handler(event, context):
    # TODO implement
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }
