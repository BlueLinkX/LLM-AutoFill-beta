# LLM Smart Autofill

LLM Smart Autofill is a Chrome extension that helps you fill online forms with your saved personal information, address, education background, and resume content.

`中文` | `English` | `日本語`

---

## 中文

### 这是什么

LLM Smart Autofill 是一个 Chrome 自动填表扩展，适合以下场景：

- 网购时填写收货信息
- 求职时填写个人资料、教育经历、简历相关内容
- 反复填写姓名、电话、邮箱、地址等常见表单

它会读取当前网页上的表单字段，结合你预先保存的资料，生成一份“填表建议”，你确认后再填入网页。

### 主要功能

- 保存个人资料、地址、教育信息、技能和简历文本
- 自动识别常见输入框、下拉框、单选框、复选框
- 生成可预览、可编辑的填表建议
- 支持普通购物表单和部分招聘表单
- 记录最近的本地日志和 token 用量
- 默认跳过密码、验证码、CVV 等高风险字段

### 安装方法

1. 打开 Chrome，进入 `chrome://extensions`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目所在文件夹
5. 安装完成后，点击扩展图标进入配置页

### 首次配置

1. 在配置页选择你要使用的 API 供应商
2. 填写对应供应商的 `API Key`
3. 选择插件语言（中文 / English / 日本語）
4. 填写你的个人资料、地址、教育经历和简历内容
5. 点击保存

补充说明：

- 公开仓库里的资料是示例数据
- 你自己的真实资料会保存在 Chrome 本地扩展存储中
- 本地也可以使用 `profile.local.json` 保存私有资料，这个文件不会上传到 Git

### 使用方法

1. 打开一个需要填写的网页
2. 点击扩展图标
3. 点击“扫描字段”
4. 点击“生成填表方案”
5. 检查建议内容，按需修改或取消勾选
6. 点击“填入选中字段”
7. 最后手动确认网页内容，再提交表单

### 日志和 token

点击弹窗右上角的日志按钮可以查看最近记录。日志中会包含：

- 页面标题和网址
- 使用的模型
- input / output / total token 数
- 扫描到的字段摘要
- 模型生成的填表建议和备注

### 注意事项

- 这是辅助填表工具，不应替代你最后的人工检查
- 招聘网站中的复杂表格、联动下拉、分步表单仍然可能识别不完整
- 不建议把银行卡、验证码、密码等敏感内容交给自动填表

### 常见问题

`为什么有些字段没有填上？`

网页字段的标签可能不清晰，或者网站使用了复杂的自定义组件。此时可以先看日志，再调整资料内容或手动填写。

`为什么下拉框有时选不中？`

不同网站下拉框实现差异很大，尤其是招聘网站。当前版本已经支持常见 `select` 和部分自定义 `combobox`，但还不是全覆盖。

`我的资料会上传到 GitHub 吗？`

不会。仓库里只有示例数据。你自己的真实资料保存在本地 Chrome 扩展存储或被 `.gitignore` 排除的本地文件里。

---

## English

### What It Does

LLM Smart Autofill is a Chrome extension for filling forms with your saved personal profile and resume data.

Typical use cases:

- Shopping forms
- Job application forms
- Repeated entry of name, phone, email, address, and education details

The extension reads the fields on the current page, compares them with your saved profile, generates a suggested fill plan, and lets you review it before applying anything.

### Main Features

- Save profile, address, education, skills, and resume text
- Detect common inputs, selects, radio buttons, checkboxes, and some custom dropdowns
- Preview and edit suggested values before filling
- Show recent local logs and token usage
- Skip risky fields such as passwords, one-time codes, and CVV fields

### Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project folder
5. Open the extension options page

### First-Time Setup

1. Choose the API provider you want to use
2. Add the matching `API key`
3. Choose the extension language (`中文` / `English` / `日本語`)
4. Enter your personal profile and resume information
5. Save the settings

Notes:

- The public repository only includes sample data
- Your real data is stored in Chrome local extension storage
- You can also keep a private `profile.local.json` file locally; it is ignored by Git

### How To Use

1. Open a page with a form
2. Click the extension icon
3. Click `Scan Fields`
4. Click `Generate Fill Plan`
5. Review and edit the suggestions
6. Click `Fill Selected Fields`
7. Verify the page manually before submitting

### Logs and Token Usage

The popup includes a log button. Recent logs can include:

- Page title and URL
- Model and reasoning level
- Input, output, and total token usage
- Field summaries
- Suggested actions and model notes

### Important Notes

- This is an assistive tool, not a zero-review auto-submit system
- Complex job application flows may still need manual correction
- Sensitive information such as passwords or payment security codes should not be automated

### FAQ

`Why were some fields left empty?`

Some sites provide weak labels or use custom components that do not expose clear structure. In those cases, the model may avoid guessing.

`Why do dropdowns sometimes fail?`

Dropdown implementations vary a lot across websites. This project supports standard `select` elements and part of the custom `combobox` patterns, but not every site-specific implementation.

`Will my personal data be uploaded to GitHub?`

No. The repository only contains sample data. Your actual profile stays in local extension storage or in git-ignored local files.

---

## 日本語

### これは何ですか

LLM Smart Autofill は、保存しておいた個人情報、住所、学歴、履歴書の内容を使って、Web フォーム入力を支援する Chrome 拡張です。

主な利用シーン：

- ネットショップの住所入力
- 就職・転職サイトの応募フォーム入力
- 氏名、電話番号、メールアドレス、住所などの繰り返し入力

現在のページ上のフォーム項目を読み取り、保存済みのプロフィールと照合して、入力候補を作成します。実際に入力する前に内容を確認できます。

### 主な機能

- 個人情報、住所、学歴、スキル、履歴書テキストを保存
- 一般的な入力欄、セレクトボックス、ラジオボタン、チェックボックスを検出
- 入力前に候補を確認・編集可能
- ローカルログと token 使用量を確認可能
- パスワード、認証コード、CVV などの高リスク項目は自動入力対象外

### インストール方法

1. Chrome で `chrome://extensions` を開く
2. 右上の `デベロッパーモード` を有効にする
3. `パッケージ化されていない拡張機能を読み込む` をクリック
4. このプロジェクトのフォルダを選択する
5. 拡張の設定ページを開く

### 初回設定

1. 使用する API プロバイダを選択する
2. 対応する `API Key` を入力する
3. 拡張機能の表示言語を選択する（中文 / English / 日本語）
4. 個人情報、住所、学歴、履歴書情報を入力する
5. 保存する

補足：

- 公開リポジトリにはサンプルデータのみが含まれています
- 実際の個人情報は Chrome のローカル拡張ストレージに保存されます
- `profile.local.json` をローカルに置くこともできます。このファイルは Git に含まれません

### 使い方

1. フォームのあるページを開く
2. 拡張アイコンをクリック
3. `Scan Fields` をクリック
4. `Generate Fill Plan` をクリック
5. 候補を確認し、必要に応じて修正する
6. `Fill Selected Fields` をクリック
7. 送信前に必ず手動で確認する

### ログと token 使用量

ポップアップ右上のログボタンから最近の記録を確認できます。ログには次のような情報が含まれます。

- ページタイトルと URL
- 使用モデルと推論レベル
- input / output / total token 数
- 検出したフィールドの要約
- モデルが返した入力候補とメモ

### 注意点

- これは入力支援ツールであり、送信前の確認は必須です
- 複雑な求人フォームや独自 UI の入力欄では、手動修正が必要になることがあります
- パスワードや決済関連の機密情報には使わないでください

### よくある質問

`一部の項目が入力されないのはなぜですか？`

サイト側のラベルが不明確だったり、独自実装の UI が使われている場合、無理に推測せず空欄のままにすることがあります。

`プルダウンがうまく選択されないことがあるのはなぜですか？`

サイトごとに実装差が大きいためです。現在は標準的な `select` と一部の `combobox` に対応していますが、すべてのサイトを完全にはカバーしていません。

`個人情報が GitHub に公開されることはありますか？`

ありません。リポジトリにはサンプルデータのみが含まれます。実際のデータはローカル拡張ストレージまたは Git 無視対象のローカルファイルに保存されます。

---

## For Developers

- Main files:
  `manifest.json`, `background.js`, `content.js`, `popup.*`, `profile.*`, `logs.*`, `defaults.js`
- Local test page:
  `demo-form.html`
- Default model:
  `gpt-5.4`
