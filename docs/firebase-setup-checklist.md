# Firebase setup checklist

オンライン対戦の実動作に必要な、ユーザー側のFirebase設定チェックリストです。
このリポジトリには実際のFirebase設定値をコミットしません。

## 作成するもの

- Firebase project
- Web app
- Realtime Database
- Anonymous Authentication

## 取得する設定値

`src/firebase-config.js` に入れる値:

```js
window.NEKO_TOWER_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID",
};
```

この値はフロントエンドに置く前提の識別情報です。
ただし、Database Rulesを緩くすると危険です。

実装上の配置先は `src/online/firebase-config.js` です。
雛形として `src/online/firebase-config.example.js` をコミットしています。
`src/online/firebase-config.js` は `.gitignore` に入っているためコミットしません。

## 初期ルール案

実装時に調整する前提のたたき台です。

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

これは開発初期用です。
公開前には、待機列、ルーム、入力、プレイヤー単位で書き込み範囲を制限します。

## 課金リスクを下げる設定

- Blazeに上げない。まずSpark無料枠で試す。
- 予算アラートを設定する。
- 公開初期は最大同時対戦数を低めにする。
- ルーム寿命を短くする。
- スナップショット送信頻度を上げすぎない。

## 実装者へ渡すもの

- Firebase config
- Database URL
- テスト用プロジェクトか本番用プロジェクトか
- 公開するドメイン

## 現在のリポジトリ状態

- `src/online/firebase-config.example.js`: コミット済みの雛形
- `src/online/firebase-config.js`: 実設定用。コミット禁止
- `src/online/online-bootstrap.js`: Firebase未設定時はオンライン機能を無効化し、設定ありなら接続確認を行う

## 接続確認

1. `src/online/firebase-config.example.js` を `src/online/firebase-config.js` にコピーする。
2. Firebase ConsoleのWeb app設定値に置き換える。
3. Realtime Databaseを作成する。
4. AuthenticationでAnonymous providerを有効化する。
5. ローカル起動後、タイトルの「オンライン対戦」を押す。
6. 1台目で「対戦相手を待っています...」が出ることを確認する。
7. 2台目または別ブラウザで同じ操作をする。
8. 「マッチしました。対戦同期は次に実装します」と出れば、Firebase初期化、匿名ログイン、待機キュー、ルーム作成は成功。

現在のSDK読み込みは、Firebase公式ドキュメントのブラウザモジュール形式に合わせて `https://www.gstatic.com/firebasejs/12.15.0/` を使う。

この段階では、まだ実際の対戦画面同期は始まらない。
確認できるのはマッチング成立まで。
