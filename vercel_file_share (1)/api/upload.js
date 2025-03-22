const multer = require('multer');
const path = require('path');

// Vercelでは、ローカルのファイルシステムを永続的に使用できません。
// 代わりに、外部のストレージサービス（Amazon S3やGoogle Cloud Storage）を使用することを推奨します。

const storage = multer.memoryStorage(); // メモリ内に保存する

const upload = multer({ storage: storage });

module.exports = (req, res) => {
  if (req.method === 'POST') {
    upload.single('file')(req, res, function (err) {
      if (err) {
        return res.status(500).json({ error: 'ファイルアップロードエラー' });
      }

      res.status(200).json({
        message: 'ファイルアップロード成功',
        fileName: req.file.originalname,
      });
    });
  } else {
    res.status(404).send('Not Found');
  }
};
