import { RDSDataService } from 'aws-sdk';

export const handler = async (event: any) => {
  try {
    // 環境変数の取得
    const clusterArn = process.env.CLUSTER_ARN;
    const secretArn = process.env.DB_SECRET_ARN;
    const databaseName = process.env.DATABASE_NAME;

    if (!clusterArn || !secretArn || !databaseName) {
      throw new Error("Required environment variables are not set");
    }
    
    // RDS Data API クライアントの初期化とクエリ実行
    const rdsData = new RDSDataService();
    
    // usersテーブルへのSELECTクエリ実行
    const result = await rdsData.executeStatement({
      resourceArn: clusterArn,
      secretArn: secretArn,
      database: databaseName,
      sql: 'SELECT * FROM users'
    }).promise();
    
    // 結果の変換 - RDS Data APIの結果形式から通常の行データに変換
    const records = result.records || [];
    const data = records.map(record => {
      // レコードの各フィールドをオブジェクトに変換
      const row: any = {};
      
      // カラム名が利用できない場合は、インデックスベースで変換
      if (result.columnMetadata) {
        result.columnMetadata.forEach((col, i) => {
          const colName = col.name || `column${i}`;
          
          // Data APIの型に基づいて適切な値を取得
          if (record[i]?.stringValue !== undefined) row[colName] = record[i].stringValue;
          else if (record[i]?.longValue !== undefined) row[colName] = record[i].longValue;
          else if (record[i]?.doubleValue !== undefined) row[colName] = record[i].doubleValue;
          else if (record[i]?.booleanValue !== undefined) row[colName] = record[i].booleanValue;
          else if (record[i]?.isNull) row[colName] = null;
          else row[colName] = null;
        });
      }
      
      return row;
    });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
