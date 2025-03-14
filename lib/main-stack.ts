import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc } from './vpc';
import { Aurora } from './aurora';
import { Lambda } from './lambda';
import { ApiGateway } from './apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'MyVpc');
    const aurora = new Aurora(this, 'MyAurora', vpc.vpc);
    const lambdaConstruct = new Lambda(this, 'MyLambda', vpc.vpc, aurora.rdsProxy.endpoint, aurora.dbSecret);
    
    new ApiGateway(this, 'MyApiGateway', lambdaConstruct.rdsProxyLambda);

    // Aurora クラスから公開されたセキュリティグループを使用
    const rdsProxySecurityGroup = aurora.proxySg;
    
    // Lambda 関数のセキュリティグループを取得
    const lambdaSecurityGroup = lambdaConstruct.rdsProxyLambda.connections.securityGroups[0];

    // RDS プロキシのセキュリティグループに Lambda からの接続を許可
    rdsProxySecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to RDS Proxy'
    );
  }
}