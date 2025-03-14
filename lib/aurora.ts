import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

export class Aurora extends Construct {
  public readonly cluster: rds.DatabaseCluster;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly rdsProxy: rds.DatabaseProxy;
  public readonly clusterArn: string;
  public readonly proxySg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, vpc: ec2.Vpc) {
    super(scope, id);

    // データベース認証情報の作成
    this.dbSecret = new secretsmanager.Secret(this, 'DBSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludeCharacters: "/@\" ",  // RDS で禁止されている文字を除外
      },
    });

    // セキュリティグループの作成
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Security group for Aurora database',
      allowAllOutbound: false
    });
  
    // セキュリティグループの作成
    this.proxySg = new ec2.SecurityGroup(this, 'ProxySG', {
      vpc,
      description: 'Security group for RDS Proxy',
      allowAllOutbound: false
    });
  
    // プロキシからデータベースへのアクセスを許可
    dbSecurityGroup.addIngressRule(
      this.proxySg,
      ec2.Port.tcp(5432),
      'Allow access from RDS Proxy'
    );
    
    // Aurora クラスターの作成
    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      defaultDatabaseName: 'testdb',
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      writer: rds.ClusterInstance.serverlessV2('WriterInstance', {
        autoMinorVersionUpgrade: true,
      }),
      serverlessV2MinCapacity: 0.5, // 最小キャパシティを設定
      serverlessV2MaxCapacity: 2,   // 最大キャパシティを設定
      storageEncrypted: true,       // ストレージの暗号化
      deletionProtection: false,    // 開発環境では削除保護を無効化（本番環境では true に設定）
      backup: {
        retention: cdk.Duration.days(7), // バックアップ保持期間
      },
      enableDataApi: true, // Data API を有効化
    });
    
    this.clusterArn = this.cluster.clusterArn;

    // RDS プロキシの作成
    this.rdsProxy = new rds.DatabaseProxy(this, 'RDSProxy', {
      vpc,
      proxyTarget: rds.ProxyTarget.fromCluster(this.cluster),
      secrets: [this.dbSecret],
      securityGroups: [this.proxySg],
      requireTLS: true,           // TLS を必須
      idleClientTimeout: cdk.Duration.seconds(900), // アイドルタイムアウト
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      debugLogging: false
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora Cluster Endpoint',
    });
  
    new cdk.CfnOutput(this, 'ProxyEndpoint', {
      value: this.rdsProxy.endpoint,
      description: 'RDS Proxy Endpoint',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.clusterArn,
      description: 'Aurora Cluster ARN for Data API',
    });
  }
}
