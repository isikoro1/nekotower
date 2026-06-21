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
- `src/online/online-bootstrap.js`: Firebase未設定時はオンライン機能を無効化する安全スタブ

