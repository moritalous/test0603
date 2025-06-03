#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AStack } from '../lib/a-stack';

const app = new cdk.App();
new AStack(app, 'AStack');
