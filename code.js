/**
 * WebアプリとしてアクセスされたときにHTMLを表示する関数
 */
function doGet(e) {
  // HTMLサービスを使用してindex.htmlを表示
  return HtmlService.createHtmlOutputFromFile('index.html')
      .setTitle('QRコードリーダー')
      // meta タグを追加してレスポンシブ対応を確実にする
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * クライアントサイドJavaScriptから呼び出され、
 * スプレッドシートにQRコードデータとタイムスタンプを記録する関数
 * @param {string} qrCodeData 読み取られたQRコードのデータ
 * @return {string} 成功メッセージまたはエラーメッセージ
 */
function recordQRCodeData(qrCodeData) {
  try {
    // アクティブなスプレッドシートを取得
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // 'シート1' という名前のシートを取得（存在しない場合はエラーになる）
    const sheet = ss.getSheetByName('シート1');

    if (!sheet) {
      throw new Error("シート 'シート1' が見つかりません。");
    }

    // スプレッドシートの最終行を取得
    const lastRow = sheet.getLastRow();
    // 新しいIDを生成 (最終行 + 1 とするが、ヘッダーがあるのでそのまま lastRow + 1 で良い)
    // もしIDが厳密に連番である必要がある場合は、A列の最大値を取得するなどの処理が必要
    const newId = lastRow; // ヘッダー行があるので、次の行番号は lastRow + 1 だが、IDとしては lastRow が適切かも？要件次第。ここではシンプルに行番号を使う。

    // 現在の日時を取得
    const timestamp = new Date();

    // シートに新しい行を追加 [ID, QRCode, Timestamp] の順
    sheet.appendRow([newId, qrCodeData, timestamp]);

    // 成功メッセージを返す
    return `記録成功: ID=${newId}, QR=${qrCodeData}`;

  } catch (error) {
    console.error('スプレッドシート記録エラー:', error);
    // エラーメッセージをクライアントに返す
    // error オブジェクト全体ではなく、message プロパティを返す方が安全
    return `エラー: ${error.message}`;
    // より詳細なエラーを返したい場合は以下のようにする（デバッグ時など）
    // return `エラー: ${error.toString()} スタック: ${error.stack}`;
  }
}
