# Source understanding

ねこタワーの現行コードを理解するためのメモです。
オンライン対戦を追加する前に読むことを想定しています。

## 主要ファイル

- `index.html`: 画面要素、canvas、タイトル、ボタン、script読み込み。
- `styles.css`: レイアウト、スマホUI、タイトル/ゲームオーバー表示。
- `src/game.js`: ゲーム本体。物理、描画、入力、状態管理。
- `src/cats.js`: 使用する猫画像ファイル一覧。
- `src/cat-contours.js`: 猫画像の輪郭当たり判定。
- `src/cat-hitboxes.js`: 補助的な当たり判定。
- `vendor/matter.min.js`: Matter.js物理エンジン。
- `tests/smoke-test.js`: Node上でゲームロジックを軽く検証するテスト。

## 状態管理

`src/game.js` の `state` が中心です。

重要な値:

- `state.screen`: `title` / `playing` / `gameover`
- `state.stage`: 現在のステージ
- `state.cats`: 生成済みの猫
- `state.active`: 操作中の猫
- `state.aiming`: 配置操作中か
- `state.score`: 入った猫の数
- `state.gameOver`: ゲーム終了フラグ
- `state.spinVelocity`: 回転入力の慣性

## 主な関数

- `reset(stage)`: ワールドを作り直してゲーム開始。
- `spawn()`: 次の猫を生成。
- `dropActive()`: 操作中の猫を落とす。
- `nextTurn()`: 得点加算して次の猫へ。
- `lose(cat)`: ゲームオーバー。
- `aimActive(dt)`: 操作中の猫の移動/回転。
- `applySpinCurveForces()`: 隠し仕様の回転カーブ。
- `step(dt)`: 物理更新と勝敗判定。
- `render()`: canvas描画。

## オンライン化で触る場所

最初に触る可能性が高い場所:

- タイトル画面: オンライン対戦ボタン追加。
- `reset()`: ソロ/オンラインで初期化方法を分ける。
- `dropActive()`: オンライン時は入力コマンドとして送る。
- `nextTurn()`: オンライン時はターン権を同期する。
- `lose()`: 勝敗をルームに書く。
- `step()`: ホストだけ物理更新するモードを追加する。
- `render()`: ゲストはスナップショット表示を優先する。

## 壊しやすい点

- Matter.jsのbodyを直接書き換えると当たり判定が壊れやすい。
- `state.active` と `state.cats` の整合性が崩れると次ターンが進まない。
- カメラ位置 `state.cameraY` と猫の座標は分けて考える。
- スマホの長押しメニュー抑止はCSS/JS両方に依存している。
- Firebase実装を `src/game.js` に直書きしすぎるとソロゲームまで壊れやすい。

## 方針

オンライン処理はできるだけ別ファイルに分ける。

候補:

- `src/online/firebase-config.example.js`
- `src/online/firebase-client.js`
- `src/online/matchmaking.js`
- `src/online/battle-session.js`
- `src/online/cpu-standin.js`

`src/game.js` は、オンラインから呼びやすい小さな関数を増やす程度に留める。

