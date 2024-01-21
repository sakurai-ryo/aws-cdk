import { Bucket } from 'aws-cdk-lib/aws-s3';
import { App, Stack } from 'aws-cdk-lib';
import { IntegTest } from '@aws-cdk/integ-tests-alpha';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';

// When deploying a large number of objects, there are cases where the CustomResource response exceeds 4096 bytes, and an error occurs.
// This test verifies that it is possible to deploy a large number of objects with the `discardReturnedSourceObjectKeys` option set to true.

const app = new App();
const stack = new Stack(app, 'TestBucketDeployment');

const bucket = new Bucket(stack, 'Bucket');

new BucketDeployment(stack, 'BucketDeployment', {
  destinationBucket: bucket,
  // deploying fifty objects fails without `discardReturnedSourceObjectKeys` option
  sources: [...Array(50)].map((_, i) => Source.data(`file${i}.txt`, 'bar')),
  memoryLimit: 1024,
  discardReturnedSourceObjectKeys: true,
});

new IntegTest(app, 'IntegBucketDeployment', {
  testCases: [stack],
});
