const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const db = require("./db");

const logger = morgan("tiny");
const fs = require('fs/promises')
const crypto = require('crypto');
const nanoid = require('nanoid/async').nanoid
const tencent = require("./tencentcos")
const exeCallback = require("./callback");
const getQrCode = require("./getqrcode")
const app = express();

// 设置body-parser中间件，解析请求体中的数据
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);


var staticDir = path.join(__dirname, './static')
console.log('static dir:', staticDir)
app.use('/static', express.static(staticDir))

//myfile.link skey

var myfileSkey = 'CILcYztUXsKJe8FAGwC8i'

//等待验证的二维码 针对myfile.link应用
var _captchaList = []

//采用长轮询方案，由服务器定时统一检查回应扫码结果，而不是客户端定时询问
setInterval(()=>{
  let timestamp = Date.now()
  for(let i=_captchaList.length-1; i>=0; i--){ //倒序遍历方便删除操作
    let item = _captchaList[i]
    if(item.state){
      if(item.resolve){
        item.resolve(1)
        item.resolve = null
      }
      //_captchaList.splice(i,1)
    }
    else if (item.t + 600000 < timestamp) {//超时10分钟删除 
      if(item.resolve)item.resolve(-1)
      _captchaList.splice(i, 1)
    }
  }
},1000)

var testhtml = null
let indexhtml = null

app.get("/", async (req, res) => {
  if (!indexhtml) {
    indexhtml = await fs.readFile(path.join(__dirname, "./index.html"), "utf-8")
  }
  res.send(indexhtml)
})
app.get("/mmv/index", async (req, res) => {

  //测试页面
  if (!testhtml) {
    testhtml = await fs.readFile(path.join(__dirname, "./captchatest.html"), "utf-8")
  }

  //模拟注册一个网站用户
  let id = await nanoid()
  const testUser = {
    openID: 'test' + id,
    skey: 'testkey' + id,
    state: 0,
    host: '1',
    callback: 'test'
  }


  let user = await db.getUserByOpenID(testUser.openID)
  if (!user) {
    await db.addUser(testUser)
  }

  //模拟生成一个二维码
  let scene = await nanoid();
  scene = scene.slice(0, 32) //微信限制在32位, 虽然nanoid生成的scene明显小于32

  let qrcode = await getQrCode(scene, false)

  //console.log('qrcode:',qrcode) 
  let html = testhtml.replace('#captcha#', qrcode)
  await db.addCode(scene, testUser.openID)

  let md5 = crypto.createHash('md5').update(qrcode).digest('hex');

  console.log("生成一个二维码验证：", md5, scene)
  _captchaList.push({
    md5,
    scene,
    state: 0, //验证结果0=未验证，1=验证成功
    t: Date.now()
  })
  res.send(html);

});

app.get("/requestAuth", async (req, res) => {

  let id = req.query.id
  //console.log("requestAuth:", id)

  await db.AddUploadID(id)

  let skey = myfileSkey
  let user = await db.getUser(skey)
  if (!user) { //没有注册服务
    return res.send({
      code: 1,
      data: '无效skey'
    })
  }

  //生成一个二维码
  let scene = await nanoid();
  scene = scene.slice(0, 32) //微信限制在32位, 虽然nanoid生成的scene明显小于32
  console.log("申请二维码 scene:",scene)

  let qrcode = await getQrCode(scene, false)

  if(!qrcode){
    return res.send({
      code: 1,
      data: '无法获取人机验证二维码'
    })
  }
  await db.updateUser(user.openid, {
    qrcount: user.qrcount + 1
  })
  await db.addCode(scene, user.openid)


  let md5 = crypto.createHash('md5').update(qrcode).digest('hex');

  _captchaList.push({
    md5,
    scene,
    state: 0, //验证结果0=未验证，1=验证成功
    t: Date.now()
  })
  res.send({
    code: 0,
    data: {
      md5,
      qrcode
    }
  });

});

//前端发来询问验证结果
//对于myfile.link来说，顺便实现COS授权

app.get("/captcharesult", async (req, res) => {

  const { token } = req.query //验证二维码的MD5
  console.log("captcharesult token：", token)

  let bHas = _captchaList.some( (item) => {
    if (item.md5 == token) {
      return true
    }
  })

  if(!bHas){
    return res.json({
      code: 1,  //code=1表示刷新
      result: 0
    })
  }
  req.on('close', function() {
    _captchaList.some((item,index) => {
      if (item.md5 == token) {
        if(item.resolve){
          item.resolve(0)
          item.resolve=null
        }
        //_captchaList.splice(index,1) 不能删除，因为客户端可能会重新发起连接询问
        return true
      }
    })
  });

  //在这等着扫码验证，连接超时关闭客户端会重新发
  console.log("等待扫码验证")
  let r = await new Promise(resolve=>{
    _captchaList.some( (item) => {
      if (item.md5 == token) {
        item.resolve=resolve
        return true
      }
    })
  })

  console.log("扫码验证完成：",r)
  if(!r)return //注意，连接超时断连不回复，客户端会重新发询问

  if(r==-1){ //二维码超时则通知前端刷新二维码
    return res.json({
      code: 1,  //code=1表示刷新
      result: 0
    })
  }

  //对象上传授权
  console.log("开始对象存储授权")
  let result = await tencent.TencentCosAuth(token)
  console.log("对象存储授权结果：",!!result)

  if(!result){
      return res.json({
        code: 0,
        result: 0
      })
  }
    
  console.log("返回询问结果：true")
  return res.json({//通知前端验证成功,并且附上
    code: 0,
    result: 1,
    data:result
  })
});


app.get("/submit", async (req, res) => {

  const {id} = req.query //验证二维码的MD5
  console.log("submit id：", id)

  await db.DelUploadID(id)
  await db.AddFile(id)
  return res.json({
    code: 1
  })
});

app.get("/getfile", async (req, res) => {

  const {id} = req.query //文件ID
  console.log("getfile id：", id)
  try {
    let r = await db.GetFile(id)
    console.log("验证文件存在：",r)
    if(r){
      r = await tencent.GetFile(id+'.txt')
      console.log("获取文件数据：",r)
      return res.send(r)
    } 
  } catch (error) {
    console.log("回取文件错误：",error)

  }
  
  return res.send({
    code:0,
    message:'无法访问指定ID的文件'
  })
});

app.get("/mmv/getcaptcha", async (req, res) => {

  let skey = req.query.skey
  console.log("user skey:", skey)

  let user = await db.getUser(skey)
  if (!user) {
    res.send({
      code: 1,
      data: '无效skey'
    })
  }

  //生成一个二维码
  let scene = await nanoid();
  scene = scene.slice(0, 32) //微信限制在32位, 虽然nanoid生成的scene明显小于32

  let qrcode = await getQrCode(scene, false)

  let md5 = crypto.createHash('md5').update(qrcode).digest('hex');

  console.log("生成一个二维码验证：", md5, scene)
  _captchaList.push({
    md5,
    scene,
    state: 0, //验证结果0=未验证，1=验证成功
    t: Date.now()
  })
  res.send({
    code: 0,
    data: {
      md5,
      qrcode
    }
  });

});

//测试网页前端发来询问验证结果
app.get("/mmv/captchaResult", async (req, res) => {
  const { token } = req.query //验证二维码的MD5
  console.log("captchaResult token：", token)
  req.on('close', function() {
    _captchaList.some((item,index) => {
      if (item.md5 == token) {
        if(item.resolve)item.resolve(0)
        //_captchaList.splice(index,1)
        return true
      }
    })
  });

  //在这等着扫码验证，连接超时关闭客户端会重新发
  let r = await new Promise(resolve=>{
    _captchaList.some( (item) => {
      if (item.md5 == token) {
        item.resolve=resolve
        return true
      }
    })
  })

  if(!r)return //注意，超时断连不回复，客户端会重新发询问

  if(r==-1){ //超时则通知前端刷新二维码
    return res.json({
      code: 1,  //code=1表示刷新
      result: 0
    })
  }

  return res.json({
    code: 0,
    result: 1
  })
});


let regUrl = /^(http|https):\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}(\/[a-zA-Z0-9/_.-]*)*$/

// 验证二维码
app.get("/mmv/verify", async (req, res) => {
  const { token } = req.query

  console.log('验证二维码 scene：', token)
  if (!token) {
    return res.send({
      code: 1,
      data: '无效参数',
    });
  }

  let callbackUrl = await db.verifyCode(token)

  console.log('二维码回调：', callbackUrl, _captchaList)

  if(!callbackUrl) {
    return res.send({
      code: 1,
      data: '无效token'
    });
  }
  if (callbackUrl == 'test') {//测试页面的假回调，
    let r = _captchaList.some((item) => {
      console.log("item:", item)
      if (item.scene == token) {
        item.state = 1  //验证通过
        return true
      }
    })
    if (r) {
      return res.send({
        code: 0,
        data: '验证成功'
      });
    } else {
      return res.send({
        code: 1,
        data: '无效token'
      });
    }
  }else if(callbackUrl.indexOf('myfile.link') != 0){
    
    await db.delCode(token)
    let r = _captchaList.some((item) => {
      console.log("item:", item)
      if (item.scene == token) {
        item.state = 1  //验证通过
        return true
      }
    })
    if (r) {
      return res.send({
        code: 0,
        data: '验证成功'
      });
    } else {
      return res.send({
        code: 1,
        data: '无效token'
      });
    }
  }
  else if (callbackUrl) {
    await db.delCode(token)
    exeCallback(callbackUrl, token)
    return res.send({
      code: 0,
      data: '验证成功'
    });
  }

});

// 申请二维码
app.get("/mmv/getqr", async (req, res) => {
  console.log("get qrcode:", req.query)

  const { skey } = req.query;
  if (!skey) {
    return res.send({
      code: 1,
      data: '无效参数',
    });
  }
  let user = await db.getUser(skey)
  if (!user) {
    return res.send({
      code: 1,
      data: '无效skey',
    });
  }

  let limit = 500
  if (user.qrcount > user.verifycount + 500) {
    return res.send({
      code: 2,
      data: '拒绝：申请的未使用二维码超过' + limit,
    });
  }

  let scene = await nanoid();
  scene = scene.slice(0, 32) //微信限制在32位, 虽然nanoid生成的scene明显小于32

  let qrcode = await getQrCode(scene, false)

  if (!qrcode) {
    return res.send({
      code: 3,
      data: '无法获取二维码',
    });
  }
  await db.updateUser(user.openid, {
    qrcount: user.qrcount + 1
  })
  await db.addCode(scene, user.openid)

  //console.log("qrcode legth:",qrcode.length)
  return res.send({
    code: 0,
    data: {
      qrcode: qrcode
    },
  });

});

// 注册服务
app.post("/mmv/register", async (req, res) => {
  const formData = req.body;
  console.log("注册服务：", formData)

  try {
    let openID = req.headers["x-wx-openid"]
    let user = await db.getUserByOpenID(openID)

    if (user) {
      let data = {
        host: formData.host,
        callback: formData.callback
      }
      if (data.host.length > 100 || data.callback.length > 100 || !regUrl.test(data.callback)) {
        return res.send({
          code: 2,
          data: '注册失败'
        });
      }
      await db.updateUser(openID, data)
      return res.send({
        code: 0,
        data: '注册成功'
      });
    }

  } catch (error) {
    console.log("注册服务错误：", error)
    return res.send({
      code: 1,
      data: error
    });
  }
});

// 获取用户信息
app.get("/mmv/myinfo", async (req, res) => {
  let openID = req.headers["x-wx-openid"]
  console.log('user:', openID)

  let user = await db.getUserByOpenID(openID)
  if (user) {
    return res.send({
      code: 0,
      data: {
        skey: user.skey,
        state: user.state,
        host: user.host,
        callback: user.callback
      }
    });
  } else {
    let skey = await nanoid();
    let data = {
      skey,
      openid: openID,
      state: 0,
      host: '',
      callback: ''
    }
    await db.addUser(data)
    return res.send({
      code: 0,
      data: data
    });
  }
});


const port = process.env.PORT || 80;

async function bootstrap() {
  await db.initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
