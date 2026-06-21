# Online battle design

ねこタワーのオンライン対戦機能の設計メモです。
最初の目的は、完璧なオンラインゲームではなく「Webで2人が交互に猫を置いて遊べる最小体験」を作ることです。

## 対象スコープ

### 最初に作る

- 2人対戦のみ。
- ランダムマッチング。
- 交互ターン。
- 自分の番で猫が器やステージ外に落ちたら負け。
- 切断時は内部的に自動操作へ切り替えて継続。
- 混雑時は待機列に入る。
- 設定がない場合、オンライン対戦は無効。

### 最初は作らない

- 観戦。
- 3人以上の対戦。
- レート、ランキング、アカウント。
- チャット。
- 厳密なチート対策。
- 課金や広告。

## 推奨構成

- フロント: 今の静的HTML/CSS/JS
- 配信: GitHub Pages
- リアルタイム同期: Firebase Realtime Database
- 認証: Firebase Anonymous Auth
- 物理演算: Matter.js

## 物理同期方針

Matter.jsを各端末で完全同期させようとしない。
ブラウザ差、フレーム差、端末差でズレるため、ホスト端末を正とする。

### ホスト

- ルーム作成者、またはマッチングで先に入った人。
- 物理演算を実行する。
- 猫の位置、角度、速度、ターン状態をDBへ送る。
- 勝敗判定を行う。

### ゲスト

- 入力コマンドをDBへ送る。
- ホストが送ったスナップショットを表示に反映する。
- 自分の番の操作UIだけ有効にする。

## ターンの流れ

1. ルーム作成。
2. 両プレイヤー参加。
3. ステージと猫の出現順を決定。
4. Player 1のターン開始。
5. 操作側が左右移動、回転、Dropを送る。
6. ホストが物理を進める。
7. 猫が安定したら次ターン。
8. 自分の番の猫が落ちたらそのプレイヤーの負け。

## Firebaseデータ案

```txt
matchmaking/
  queue/
    {uid}:
      createdAt
      lastSeenAt
      status: waiting | matched

rooms/
  {roomId}:
    status: matching | playing | finished | abandoned
    createdAt
    updatedAt
    stage
    hostUid
    turnUid
    turnNo
    winnerUid
    loserUid
    reason
    players/
      {uid}:
        joinedAt
        lastSeenAt
        connected
        displayName
    input/
      {uid}:
        aimX
        spinInput
        dropRequestedAt
        updatedAt
    snapshot:
      updatedAt
      cats:
        {catId}:
          asset
          x
          y
          angle
          vx
          vy
          angularVelocity
          dropped
      activeCatId
      aiming
      cameraY
```

## マッチング設計

- 待機列に入る。
- 空きがあれば一番古い待機者同士をマッチする。
- 同時対戦数が上限なら待機継続。
- 待機中は推定待ち時間を表示する。
- 待ちながらソロで遊べるようにする。
- マッチ成立時は画面表示、音、可能ならブラウザ通知を出す。

## 混雑制限

初期値:

- 最大同時対戦: 20部屋
- 最大待機人数: 100人
- 待機タイムアウト: 5分
- ルーム更新なしタイムアウト: 3分
- 1ターン制限: 30秒

満員時:

- 「ただいま混雑中です」
- 「待機する」
- 「ソロで遊びながら待つ」

## 切断設計

### 検知

- `lastSeenAt` を数秒おきに更新する。
- 10秒以上更新がない場合は通信不安定扱い。
- 20秒以上更新がない場合は内部的に自動操作へ切替。

### 表示

CPUとは表示しない。

使える文言:

- 通信が不安定です
- 対戦を継続します
- 相手のターン
- 待機中

### 自動操作

- ランダムな横移動。
- ランダムな回転。
- 1から4秒程度待ってDrop。
- 強すぎるAIにしない。

## Firebase設定ファイル

コミットする:

- `src/online/firebase-config.example.js`

コミットしない:

- `src/online/firebase-config.js`

`src/online/firebase-config.js` が存在しない場合、オンライン対戦は無効にする。

現在は `src/online/online-bootstrap.js` が `window.NekoTowerOnline` を作る。
Firebase設定がない場合は `status: "disabled"` になり、既存ソロゲームには影響しない。

## Database Rules方針

- 匿名認証済みユーザーだけ読み書き可能。
- 自分の `players/{uid}` と `input/{uid}` だけ書ける。
- ルーム作成、参加、更新は必要最小限。
- 古いルーム削除は最初はクライアント側の掃除処理で代用。
- 本格的な不正対策は後回し。

## 検証順

1. 設定なしでソロゲームが壊れない。
2. テストFirebaseで1台ブラウザ2タブ対戦。
3. スマホ2台で同一Wi-Fi対戦。
4. 片方を閉じて自動継続するか確認。
5. 混雑制限の表示確認。
6. GitHub Pages上でスマホ2台テスト。
