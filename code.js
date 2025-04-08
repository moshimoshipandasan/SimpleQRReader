// ★ スプレッドシートIDを保存するプロパティキー
const SPREADSHEET_ID_PROPERTY_KEY = 'SPREADSHEET_ID';
// ★ シート名を定数として定義
const LIST_SHEET_NAME = '一覧'; // データ更新対象シート
const LOG_SHEET_NAME = 'ログ';   // ログ記録対象シート

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
function doGet(e) { // この関数はWebアプリの入り口として必要です
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
 * QRコードデータ（識別番号）に一致する行のD列にデータを更新する関数
 * @param {string} qrCodeData 読み取られたQRコードのデータ（識別番号）
 * @param {string} inputValue index.htmlのテキストボックスに入力された値
 * @return {string} 成功メッセージまたはエラーメッセージ（一覧シートの更新結果を返す）
 */
function updateDataByQRCode(qrCodeData, inputValue) {
  // const sheetName = '一覧'; // LIST_SHEET_NAME を使用
  const targetColumnIndex = 3; // D列 (0始まりのインデックス)
  const idColumnIndex = 0; // A列 (識別番号、0始まり)

  // 値が空文字列の場合はTRUE（論理値）を設定
  const valueToWrite = (inputValue === '') ? true : inputValue;

  const lock = LockService.getScriptLock();
  try {
    // 同時実行制御のためにロックを試みる (最大30秒待機)
    lock.waitLock(30000);

    // ★ スプレッドシートIDをプロパティから取得 (ログ記録にも必要)
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY_KEY);
    if (!spreadsheetId) {
      // ID未設定の場合はエラーを返す (showSetSpreadsheetIdDialogで設定が必要)
      throw new Error('記録先のスプレッドシートIDが設定されていません。メニューから設定してください。');
    }
    const ss = SpreadsheetApp.openById(spreadsheetId); // ★ IDで開く

    // --- 1. 一覧シートの更新 ---
    const listSheet = ss.getSheetByName(LIST_SHEET_NAME);
    if (!listSheet) {
      throw new Error(`シート「${LIST_SHEET_NAME}」が見つかりません。`);
    }

    const dataRange = listSheet.getDataRange(); // ★ listSheetから取得
    const values = dataRange.getValues();

    let listUpdateSuccess = false; // 一覧シート更新成否フラグ
    let targetRow = -1; // 見つかった行番号 (1始まり)

    // ヘッダー行を除いて識別番号を検索 (A列)
    for (let i = 1; i < values.length; i++) {
      // 型が異なる可能性を考慮して文字列として比較
      if (String(values[i][idColumnIndex]) === String(qrCodeData)) {
        targetRow = i + 1; // 行番号は1始まり
        listUpdateSuccess = true; // ★フラグをtrueに
        break;
      }
    }

    let updateResultMessage = ''; // クライアントに返すメッセージ

    if (listUpdateSuccess) {
      // D列 (インデックス3+1=4列目) に値を書き込む
      listSheet.getRange(targetRow, targetColumnIndex + 1).setValue(valueToWrite);
      console.log(`一覧シート更新成功: 識別番号=${qrCodeData}, 行=${targetRow}, 書き込み値=${valueToWrite}`);
      updateResultMessage = "正常にデータ更新されました";
    } else {
      console.warn(`一覧シート更新失敗: 識別番号「${qrCodeData}」が見つかりません。`);
      updateResultMessage = "識別番号がみつかりませんでした";
      // ★識別番号が見つからない場合はログ記録もしない（あるいは別のログを残すか選択）
      // 今回は見つからない場合はログも記録しない仕様とする
    }

    // --- 2. ログシートへの記録 (常に実行) ---
    try {
      const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
      if (!logSheet) {
        // ログシートがなくても処理は続行するが、コンソールに警告を出す
        console.warn(`ログシート「${LOG_SHEET_NAME}」が見つかりません。ログは記録されません。`);
      } else {
        const timestamp = new Date();
        // ログシートに追記 [タイムスタンプ, 識別番号, 入力値] (元の順序に戻す)
        // 識別番号が見つからなかった場合も記録される
        logSheet.appendRow([timestamp, qrCodeData, valueToWrite]);
        console.log(`ログ記録試行: タイムスタンプ=${timestamp}, 識別番号=${qrCodeData}, 値=${valueToWrite}, 更新結果=${listUpdateSuccess}`);
      }
    } catch (logError) {
      // ログ記録のエラーはコンソールに出力するのみで、クライアントへのエラーとはしない
      console.error(`ログ記録エラー: 識別番号=${qrCodeData}, 値=${valueToWrite}`, logError);
    }

    // 最終的な結果メッセージ（一覧シートの更新結果）を返す
    return updateResultMessage;

  } catch (error) {
    console.error('データ更新/ログ記録処理エラー:', error);
    // より詳細なエラーメッセージをクライアントに返す
    // スプレッドシートID未設定エラーもここでキャッチされる
    return `エラーが発生しました: ${error.message}`;
  } finally {
    // 処理が終了したら必ずロックを解放する
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
      // api.qrserver.com APIを使用してQRコードURLを生成 (サイズ150x150, マージン10)
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(id)}&margin=10`;
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
