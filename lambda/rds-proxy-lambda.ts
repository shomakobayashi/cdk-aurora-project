// lambda/rds-proxy-lambda.ts
import { SecretsManager } from 'aws-sdk';
import { Client } from 'pg';

export const handler = async (event: any) => {
  console.log('Lambda function started', { requestId: event.requestContext?.requestId });
  
  let client;
  
  try {
    // Secrets Manager から DB の認証情報を取得
    const secretsManager = new SecretsManager();
    const secretArn = process.env.DB_SECRET_ARN;

    if (!secretArn) {
      throw new Error("DB_SECRET_ARN is not set");
    }

    const secretValue = await secretsManager.getSecretValue({ SecretId: secretArn }).promise();
    const secret = JSON.parse(secretValue.SecretString || '{}');
    const host = process.env.RDS_PROXY_ENDPOINT;
    
    if (!host) {
      throw new Error("RDS_PROXY_ENDPOINT is not set");
    }
    
    // クライアント作成
    client = new Client({
      host,
      port: 5432,
      user: secret.username,
      password: secret.password,
      database: 'testdb',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    // 接続
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully');
    
    // クエリ実行
    console.log('Executing query...');
    const res = await client.query('SELECT NOW() as time, current_user as user, version() as version');
    console.log('Query executed successfully');
    
    // レスポンス
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        data: res.rows,
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        timestamp: new Date().toISOString()
      }),
    };
  } finally {
    // 接続のクリーンアップ
    if (client) {
      try {
        await client.end();
        console.log('Database connection closed');
      } catch (err) {
        console.error('Error closing database connection:', err);
      }
    }
  }
};
