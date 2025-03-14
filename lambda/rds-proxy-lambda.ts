import { SecretsManager } from 'aws-sdk';
import { Client } from 'pg';

const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));
const pg = require('pg');
const capturedPg = AWSXRay.capturePostgres(pg);

export const handler = async (event: any) => {
  console.log('Lambda function started', { requestId: event.requestContext?.requestId });
  
  let client;
  
  try {
    // Secrets Manager からの取得を計測するサブセグメントを作成
    const segment = AWSXRay.getSegment();
    const secretSegment = segment.addNewSubsegment('GetDBCredentials');
    
    // Secrets Manager から DB の認証情報を取得
    const secretsManager = new AWS.SecretsManager();
    const secretArn = process.env.DB_SECRET_ARN;

    if (!secretArn) {
      throw new Error("DB_SECRET_ARN is not set");
    }

    const secretValue = await secretsManager.getSecretValue({ SecretId: secretArn }).promise();
    const secret = JSON.parse(secretValue.SecretString || '{}');
    const host = process.env.RDS_PROXY_ENDPOINT;
    
    // サブセグメントを閉じる
    secretSegment.close();
    
    if (!host) {
      throw new Error("RDS_PROXY_ENDPOINT is not set");
    }
    
    // DB 接続のサブセグメントを作成
    const connectSegment = segment.addNewSubsegment('DBConnection');
    
    // クライアント作成
    client = new capturedPg.Client({
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
    
    // DB 接続サブセグメントを閉じる
    connectSegment.close();
    
    // クエリ実行のサブセグメントを作成
    const querySegment = segment.addNewSubsegment('QueryExecution');
    
    // クエリ実行
    console.log('Executing query...');
    const res = await client.query('SELECT NOW() as time, current_user as user, version() as version');
    console.log('Query executed successfully');
    
    // クエリ実行サブセグメントを閉じる
    querySegment.close();
    
    // レスポンス作成のサブセグメントを作成
    const responseSegment = segment.addNewSubsegment('PrepareResponse');
    
    // レスポンス
    const response = {
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
    
    // レスポンス作成サブセグメントを閉じる
    responseSegment.close();
    
    return response;
  } catch (error) {
    // エラー処理のサブセグメントを作成
    const segment = AWSXRay.getSegment();
    const errorSegment = segment.addNewSubsegment('ErrorHandling');
    
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error', error);
    
    // X-Ray にエラーを記録（型を明示的に処理）
    if (error instanceof Error) {
      errorSegment.addError(error);
    } else {
      errorSegment.addError(new Error(String(error)));
    }
    
    const response = {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        timestamp: new Date().toISOString()
      }),
    };
    
    // エラー処理サブセグメントを閉じる
    errorSegment.close();
    
    return response;
  } finally {
    if (client) {
      // クリーンアップのサブセグメントを作成
      const segment = AWSXRay.getSegment();
      const cleanupSegment = segment.addNewSubsegment('Cleanup');
      
      try {
        // 接続のクリーンアップ
        await client.end();
        console.log('Database connection closed');
      } catch (err) {
        console.error('Error closing database connection:', err);
        // エラーの型を明示的に処理
        if (err instanceof Error) {
          cleanupSegment.addError(err);
        } else {
          cleanupSegment.addError(new Error(String(err)));
        }
      } finally {
        // クリーンアップサブセグメントを閉じる
        cleanupSegment.close();
      }
    }
  }
}
