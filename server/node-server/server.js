const http = require("http");
const path = require("path");
const fse = require("fs-extra");
const multiparty = require("multiparty");
const server = http.createServer();
const UPLOAD_DIR = path.resolve(__dirname, ".", "target"); // 大文件存储目录

const resolvePost = req =>
  new Promise(resolve => {
          let chunk = "";
          req.on("data", data => {
            console.log('data', data);
            chunk += data;
          });
          req.on("end", () => {
             resolve(JSON.parse(chunk));
          });
  });

  const pipeStream = (path, writeStream) =>
    new Promise(resolve => {
       const readStream = fse.createReadStream(path);
       readStream.on("end", () => {
            fse.unlinkSync(path);
            resolve();
           });
        readStream.pipe(writeStream);
      });

// 合并切片
const mergeFileChunk = async (filePath, filename, size) => {
     console.log('size', size)
     console.log('1234567890', filePath)
     console.log('098654321', filename)
     const chunkDir = path.resolve(UPLOAD_DIR, filename);
     const chunkPaths = await fse.readdir(chunkDir);
     // 根据切片下标进行排序
     // 否则直接读取目录的获得的顺序可能会错乱
     chunkPaths.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
     console.log('chunkPaths', chunkPaths)
     await Promise.all(
        chunkPaths.map((chunkPath, index) =>{
            let path = path.resolve(chunkDir, chunkPath)
            let writeStream = fse.createWriteStream(filePath, {
              start: index * size,
              end: (index + 1) * size
            })
            return new Promise(resolve => {
              const readStream = fse.createReadStream(path);
              readStream.on("end", () => {
                fse.unlinkSync(path);
                resolve();
              });
              readStream.pipe(writeStream);
            });
          }
           // pipeStream(
           //       path.resolve(chunkDir, chunkPath),
           //      // 指定位置创建可写流
           //       fse.createWriteStream(filePath, {
           //         start: index * size,
           //         end: (index + 1) * size
           //       })
           // )
        )
    );
    fse.rmdirSync(chunkDir); // 合并后删除保存切片的目录
  };


server.on("request", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.status = 200;
    res.end();
    return;
  }

  if (req.url === "/merge") {
    console.log('req===>', req)
    const data = await resolvePost(req);
    console.log('---------', data)
    const { filename,size } = data;
    const filePath = path.resolve(UPLOAD_DIR, `${filename}`);
    console.log('opoppopop', filePath)
    await mergeFileChunk(filePath, filename, size);
    console.log('shshshshshsh==>;')
    return res.end(
      JSON.stringify({
        code: 0,
        message: "file merged success"
      })
    );
  }
  if (req.url === "/") {
    const multipart = new multiparty.Form();
    multipart.parse(req, async (err, fields, files) => {
      if (err) {
        return;
      }
      console.log('fields', fields);
      console.log('files', files);
      const [chunk] = files.chunk;
      const [hash] = fields.hash;
      const [filename] = fields.filename;
      const chunkDir = path.resolve(UPLOAD_DIR, filename);
      console.log('chunkDir', chunkDir);

      // 切片目录不存在，创建切片目录
      if (!fse.existsSync(chunkDir)) {
        console.log('创建', chunkDir);
        await fse.mkdirs(chunkDir);
      }

      // fs-extra 专用方法，类似 fs.rename 并且跨平台
      // fs-extra 的 rename 方法 windows 平台会有权限问题
      // https://github.com/meteor/meteor/issues/7852#issuecomment-255767835
      console.log('chunk.path: ', chunk.path)
      console.log('chunkdirhash: ', `${chunkDir}/${hash}`)
      await fse.move(chunk.path, `${chunkDir}/${hash}`); // 原来文件存到chunk.path下面 现在移动到 `${chunkDir}/${hash}`这个下面
      res.end("received file chunk");
    });
  }
});

server.listen(3000, () => console.log("监听 3000 端口"));
