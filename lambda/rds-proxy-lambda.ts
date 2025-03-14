// lambda/rds-proxy-lambda.ts
import { SecretsManager } from 'aws-sdk';
import { Client } from 'pg';

// 重要: 関数をエクスポートする方法を修正
export const handler = async (event: any) => {
  console.log('Lambda function started');
  
    // Secrets Manager から DB の認証情報を取得
    console.log('Initializing SecretsManager');
    const secretsManager = new SecretsManager();
    const secretArn = process.env.DB_SECRET_ARN;

    if (!secretArn) {
      throw new Error("DB_SECRET_ARN is not set");
    }

    const secretValue = await secretsManager.getSecretValue({ SecretId: secretArn }).promise();
    const secret = JSON.parse(secretValue.SecretString || '{}');
    const host = process.env.RDS_PROXY_ENDPOINT;
    
    const client = new Client({
      host,
      port: 5432,
      user: secret.username,
      password: secret.password,
      database: 'testdb',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    });

    const res = await client.query('SELECT NOW()');
    
    return {
      statusCode: 200,
      body: JSON.stringify(res.rows),
    };
};
