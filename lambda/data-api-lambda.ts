import * as AWSXRay from 'aws-xray-sdk-core';
import * as AWS from 'aws-sdk';

const awsXRay = AWSXRay as any; // TypeScriptの型定義の問題を回避
const aws = awsXRay.captureAWS(AWS);

// RDS Data APIのレコード型を定義
interface RDSDataRecord {
  [index: number]: {
    stringValue?: string;
    longValue?: number;
    booleanValue?: boolean;
    doubleValue?: number;
    isNull?: boolean;
    arrayValue?: any;
  };
}

interface ResultRow {
  time: string | null;
  user: string | null;
  version: string | null;
}

export const handler = async (event: any) => {
  console.log('Data API Lambda started', { requestId: event.requestContext?.requestId });
  
  try {
    // 環境変数の取得
    const segment = awsXRay.getSegment();
    const subSegment = segment.addNewSubsegment('DataAPIExecution');
    
    const clusterArn = process.env.CLUSTER_ARN;
    const secretArn = process.env.DB_SECRET_ARN;
    const databaseName = process.env.DATABASE_NAME;

    if (!clusterArn || !secretArn || !databaseName) {
      throw new Error("Required environment variables are not set");
    }
    
    // RDS Data API クライアントの初期化とクエリ実行
    const rdsData = new aws.RDSDataService();
    const result = await rdsData.executeStatement({
      resourceArn: clusterArn,
      secretArn: secretArn,
      database: databaseName,
      sql: 'SELECT NOW() as time, current_user as user, version() as version'
    }).promise();
    
    // 結果の変換 - 型を明示的に指定
    const records = result.records || [];
    const data = records.map((record: RDSDataRecord): ResultRow => ({
      time: record[0]?.stringValue || null,
      user: record[1]?.stringValue || null,
      version: record[2]?.stringValue || null
    }));
    
    subSegment.close();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        data,
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error', error);
    
    // エラー処理を簡潔化
    const segment = awsXRay.getSegment();
    const errorSegment = segment.addNewSubsegment('Error');
    errorSegment.addError(error instanceof Error ? error : new Error(String(error)));
    errorSegment.close();
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        timestamp: new Date().toISOString()
      }),
    };
  }
};
