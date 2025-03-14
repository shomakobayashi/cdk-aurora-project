// lambda/data-api-lambda.ts
// requireを使用してX-Ray SDKを読み込み
const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));

// RDS Data API のレコード型を定義
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

// 結果の行データ型を定義
interface ResultRow {
  time?: string;
  user?: string;
  version?: string;
  [key: string]: any;
}

export const handler = async (event: any) => {
  console.log('Data API Lambda function started', { requestId: event.requestContext?.requestId });
  
  try {
    // 環境変数の取得
    const segment = AWSXRay.getSegment();
    const envSegment = segment.addNewSubsegment('GetEnvironmentVariables');
    const clusterArn = process.env.CLUSTER_ARN;
    const secretArn = process.env.DB_SECRET_ARN;
    const databaseName = process.env.DATABASE_NAME;

    if (!clusterArn || !secretArn || !databaseName) {
      throw new Error("Required environment variables are not set");
    }
    
    envSegment.close();

    // クエリ実行をサブセグメントで計測
    const querySegment = segment.addNewSubsegment('DataAPIQuery');

    // RDS Data API クライアントの初期化
    const rdsData = new AWS.RDSDataService();
    
    console.log('Executing query via Data API...');
    
    // クエリの実行
    const result = await rdsData.executeStatement({
      resourceArn: clusterArn,
      secretArn: secretArn,
      database: databaseName,
      sql: 'SELECT NOW() as time, current_user as user, version() as version'
    }).promise();
    
    console.log('Query executed successfully');
    
    querySegment.close();
    
    // 結果の変換
    const processSegment = segment.addNewSubsegment('ProcessResults');
    
    const records = result.records || [];
    const data = records.map((record: RDSDataRecord): ResultRow => {
      const row: ResultRow = {};
      if (record[0]?.stringValue) row.time = record[0].stringValue;
      if (record[1]?.stringValue) row.user = record[1].stringValue;
      if (record[2]?.stringValue) row.version = record[2].stringValue;
      return row;
    });
    
    processSegment.close();
    
    // レスポンス作成
    const responseSegment = segment.addNewSubsegment('PrepareResponse');
    
    const response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        data: data,
        timestamp: new Date().toISOString()
      }),
    };
    
    responseSegment.close();
    
    return response;
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error', error);
    
    // エラーをX-Rayに記録
    const segment = AWSXRay.getSegment();
    const errorSegment = segment.addNewSubsegment('ErrorHandling');
    
    // エラーの型を明示的に処理
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
    
    errorSegment.close();
    
    return response;
  }
}
