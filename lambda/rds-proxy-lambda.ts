import { SecretsManager } from 'aws-sdk';
import { Client } from 'pg';

export const handler = async (event: any) => {
  let client;
  
  try {

    // Secrets Managerから認証情報を取得
    const secretsManager = new SecretsManager();
    const secretValue = await secretsManager.getSecretValue({ 
      SecretId: process.env.DB_SECRET_ARN || '' 
    }).promise();
    const secret = JSON.parse(secretValue.SecretString || '{}');
    
    // クライアント作成と接続
    client = new Client({
      host: process.env.RDS_PROXY_ENDPOINT,
      port: 5432,
      user: secret.username,
      password: secret.password,
      database: 'testdb',
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    
    // テーブルへのSELECTクエリ実行
    const result = await client.query('SELECT * FROM users');
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: result.rows })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
      }
    }
  }
};
