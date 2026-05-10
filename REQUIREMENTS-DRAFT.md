# Solution Requirements - DRAFT

This is a draft requirements file. I will use this to flesh out fine grained requirements, and store these requirements in a REQUIREMENTS-FINAL.md file

I want a cloud hosted solution which will allow me to cast audio and video files I own to devices via chromecast

## Rough Requirements

* Web service that is accessible via my phone from anywhere
* Web service that allows me to:
  * Select a device to cast to
  * List Audio and Video
  * Select audio or video file

## Must have conditions

* I want this hosted in a single AWS account
  * I have full admin access to this AWS account
  * Account ID : 601374407704
* Files will reside in an S3 bucket
  * This bucket already exists and resides in the AWS account mentioned previously
  * Bucket ARN : `arn:aws:s3:::dmcgowan-cloudstore`
  * Mixture of different files in this bucket. They follow a windows filesystem naming standard
* I want infrastructure written in Pulumi
  * Directory of `pulumi` to store infra code
* I want application code written in TypeScript
  * Directory of `app` to store application code
* Use a Makefile to perform pulumi or application builds / deployments
  * Note the existing `prepare` definition in the Makefile. This is important as it ensures any build steps take place outside of the mounted directory. We want to do this as performance on the mounted directory is bad
  * Ensure we use something like this for any build / deployment steps for Pulumi and App

## Nice to Have

* SSO with my Google Login
  * If this requires significant integration work, OR signup to a third-party service, skip and stick to username and password based login
* Would like https://vuejs.org/ as the framework, provided it's the right fit