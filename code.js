// ★ スプレッドシートIDを保存するプロパティキー
const SPREADSHEET_ID_PROPERTY_KEY = 'SPREADSHEET_ID';
// ★ シート名を定数として定義 (これもプロパティ化可能だが、今回はIDのみ)
const SHEET_NAME = 'ログ';

/**
 * スプレッドシートが開かれたときにカスタムメニューを追加する関数
 */
function onOpen(e) {
  SpreadsheetApp.getUi()
      .createMenu('QRコードツール') // メニュー名を変更
      .addItem('QRコードリーダー設定', 'showSetSpreadsheetIdDialog') // サブメニュー化も検討可能だが、一旦並列で追加
      .addSeparator() // 区切り線を追加
      .addItem('QRコード作成 (一覧シート)', 'createQRCodes') // 新しいメニュー項目を追加
      .addToUi();
}

/**
 * スプレッドシートID設定ダイアログを表示する関数
 */
function showSetSpreadsheetIdDialog() {
  const ui = SpreadsheetApp.getUi();
  const scriptProperties = PropertiesService.getScriptProperties();
  const currentId = scriptProperties.getProperty(SPREADSHEET_ID_PROPERTY_KEY);

  const promptMessage = currentId
    ? `現在のスプレッドシートID: ${currentId}\n\n新しいIDを入力してください (キャンセルで変更なし):`
    : '記録先のスプレッドシートIDを入力してください:';

  const result = ui.prompt(
      'スプレッドシートID設定',
      promptMessage,
      ui.ButtonSet.OK_CANCEL);

  // OKボタンが押され、テキストが入力された場合
  if (result.getSelectedButton() == ui.Button.OK) {
    const newId = result.getResponseText().trim();
    if (newId) {
      saveSpreadsheetId(newId);
      ui.alert(`スプレッドシートIDを「${newId}」に設定しました。`);
    } else if (currentId) {
      // 新しいIDが空で、既存のIDがあった場合は変更しない旨を通知（任意）
      ui.alert('IDが入力されなかったため、変更されませんでした。');
    } else {
       ui.alert('IDが入力されていません。設定をキャンセルしました。');
    }
  } else {
    ui.alert('設定をキャンセルしました。');
  }
}

/**
 * スプレッドシートIDをスクリプトプロパティに保存する関数
 * @param {string} spreadsheetId 保存するスプレッドシートID
 */
function saveSpreadsheetId(spreadsheetId) {
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_PROPERTY_KEY, spreadsheetId);
}

/**
 * WebアプリとしてアクセスされたときにHTMLを表示する関数
 */
function doGet(e) {
  // HTMLサービスを使用してindex.htmlを表示
  return HtmlService.createHtmlOutputFromFile('index.html')
      .setTitle('QRコードリーダー')
      // meta タグを追加してレスポンシブ対応を確実にする
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      // ★ Google Apps Scriptのヘッダーバーを非表示にする（推奨される方法）
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * クライアントサイドJavaScriptから呼び出され、
 * スプレッドシートにQRコードデータとタイムスタンプを記録する関数
 * ★ LockServiceを使用して同時書き込みの競合を防ぐ
 * ★ スプレッドシートIDはプロパティから取得する
 * @param {string} qrCodeData 読み取られたQRコードのデータ
 * @return {string} 成功メッセージまたはエラーメッセージ
 */
function recordQRCodeData(qrCodeData) {
  // ★ プロパティからスプレッドシートIDを取得
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY_KEY);

  // ★ IDが設定されていない場合はエラーを返す
  if (!spreadsheetId) {
    const setupMessage = 'エラー: 記録先のスプレッドシートIDが設定されていません。スプレッドシートのメニュー「QRコードリーダー設定」>「スプレッドシートID設定」から設定してください。';
    console.error(setupMessage);
    return setupMessage;
  }

  const lock = LockService.getScriptLock();
  let successMessage = '';

  try {
    lock.waitLock(30000);

    // ★ プロパティから取得したIDでスプレッドシートを開く
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      throw new Error(`シート '${SHEET_NAME}' が見つかりません。`);
    }

    const lastRow = sheet.getLastRow();
    const newId = lastRow;
    const timestamp = new Date();

    sheet.appendRow([newId, qrCodeData, timestamp]);

    successMessage = `記録成功: ID=${newId}, QR=${qrCodeData}`;
    console.log(successMessage);

    lock.releaseLock();
    return successMessage;

  } catch (error) {
    console.error('スプレッドシート記録エラー:', error);
    // エラーにスプレッドシートIDに関する情報が含まれているか確認
    if (error.message.includes("You do not have permission") || error.message.includes("not found")) {
       return `エラー: スプレッドシート (ID: ${spreadsheetId}) へのアクセス権がないか、シートが見つかりません。IDが正しいか、アクセス権を確認してください。詳細: ${error.message}`;
    }
    return `エラー: ${error.message}`;
  } finally {
    // finallyブロックでもロックが保持されていれば解放する
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

/**
 * 「一覧」シートのA列のデータからQRコードを生成し、C列にIMAGE関数で表示する関数
 */
function createQRCodes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = '一覧'; // 対象シート名
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    SpreadsheetApp.getUi().alert(`シート「${sheetName}」が見つかりません。`);
    return;
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues(); // シート全体のデータを取得

  // ヘッダー行を除き、A列にデータがある行を処理
  const formulas = [];
  for (let i = 1; i < values.length; i++) { // i = 0 はヘッダーなのでスキップ
    const id = values[i][0]; // A列の識別番号
    if (id) { // 識別番号が空でない場合のみ処理
      // api.qrserver.com APIを使用してQRコードURLを生成 (サイズ75x75, マージン10)
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=75x75&data=${encodeURIComponent(id)}&margin=10`;
      // IMAGE関数を作成
      formulas.push([`=IMAGE("${qrCodeUrl}")`]);
    } else {
      formulas.push(['']); // 識別番号がない場合は空文字を設定
    }
  }

  // C列（3列目）のデータ範囲に数式を設定 (ヘッダー行を除く)
  if (formulas.length > 0) {
    // 書き込み範囲を A列のデータがある行数 + 1行目(ヘッダー) から計算
    // 開始行: 2 (ヘッダーの次)
    // 開始列: 3 (C列)
    // 行数: formulas.length
    // 列数: 1
    sheet.getRange(2, 3, formulas.length, 1).setFormulas(formulas);
    SpreadsheetApp.getUi().alert('QRコードの生成が完了しました。');
  } else {
    SpreadsheetApp.getUi().alert('処理対象のデータがありませんでした。');
  }
}
