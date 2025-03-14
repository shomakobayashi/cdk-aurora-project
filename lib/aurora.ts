import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class Aurora extends Construct {
  public readonly cluster: rds.DatabaseCluster;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly rdsProxy: rds.DatabaseProxy;
  public readonly clusterArn: string;
  public readonly proxySg: ec2.SecurityGroup; // プロキシのセキュリティグループを公開

  constructor(scope: Construct, id: string, vpc: ec2.Vpc) {
    super(scope, id);

    this.dbSecret = new secretsmanager.Secret(this, 'DBSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludeCharacters: "/@\" ",  // RDS で禁止されている文字を除外
      },
    });

    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      defaultDatabaseName: 'testdb',
      vpc,
      writer: rds.ClusterInstance.serverlessV2('WriterInstance', {}),
    });

    this.clusterArn = this.cluster.clusterArn;

    // セキュリティグループを作成（既存のコードを活用）
    this.proxySg = new ec2.SecurityGroup(this, 'ProxySG', { vpc });

    this.rdsProxy = new rds.DatabaseProxy(this, 'RDSProxy', {
      vpc,
      secrets: [this.dbSecret],
      proxyTarget: rds.ProxyTarget.fromCluster(this.cluster),
      securityGroups: [this.proxySg], // 作成したセキュリティグループを使用
    });
  }
}
