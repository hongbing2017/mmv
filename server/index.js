const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const db = require("./db");

const logger = morgan("tiny");
const  fs = require('fs/promises')
const crypto = require('crypto');
const nanoid = require('nanoid/async').nanoid

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



var staticDir = path.join(__dirname,'./static')
console.log('static dir:',staticDir)
app.use('/static',express.static(staticDir))


//测试相关 
var captchaList = []

var testhtml = null
let indexhtml= null
// 首页
// app.get("/",async(req,res)=>{
//     if(!indexhtml){
//       indexhtml = await fs.readFile(path.join(__dirname, "./index.html"),"utf-8")
//     }
//     res.send(indexhtml)
// })
app.get("/mmv/captcha", async (req, res) => {

  //测试页面
  if(!testhtml){
    testhtml = await fs.readFile(path.join(__dirname, "./captchatest.html"),"utf-8")
  } 

  //模拟注册一个网站用户
  let id = await nanoid()
  const testUser = {
    openID:'test'+id, 
    skey:'testkey'+id,
    state: 0,
    host: '',
    callback:'test'
   }


  let user = await db.getUserByOpenID(testUser.openID)
  if (!user) {
      await db.addUser(testUser)
  } 
   
  //模拟生成一个二维码
  let scene = await nanoid();
  scene = scene.slice(0, 32) //微信限制在32位, 虽然nanoid生成的scene明显小于32

  let qrcode = await getQrCode(scene,false)

  //console.log('qrcode:',qrcode) 
  testhtml.replace('#captcha#',qrcode)
  await db.addCode(scene,testUser.openID)

  let md5 = crypto.createHash('md5').update(qrcode).digest('hex');

  console.log("生成一个二维码验证：",md5,scene)
  captchaList.push({
    md5,
    scene,
    state:0, //验证结果0=未验证，1=验证成功
    t:Date.now()
  })
  res.send(html);
  
});

//前端发来询问验证结果
app.get("/mmv/captchaResult", async (req, res) => {
  const {token}=req.query //验证二维码的MD5
  console.log("captchaResult token：",token)
  let timestamp= Date.now()
  captchaList.some((item,index)=>{
    if(item.md5 ==  token){
      if(item.state==1){
        res.json({//通知前端验证成功
          code:0,
          result:1
        })
        captchaList.splice(index,1)
      }else{      
        res.json({
          code:0,
          result:0
        })
      }    
    }else{
      if(item.t+600000>timestamp){//超时10分钟删除 
        captchaList.splice(index,1)
      }
    }
  })
});


let regUrl = /^(http|https):\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}(\/[a-zA-Z0-9/_.-]*)*$/

// 验证二维码
app.get("/mmv/verify", async (req, res) => {
  const { token } = req.query

  console.log('验证二维码：',token)
  if (!token) {
    return res.send({
      code: 1,
      data: '无效参数',
    });
  }
  
  let callbackUrl = await db.verifyCode(token)
  
  console.log('二维码回调：',callbackUrl,captchaList)

  if(callbackUrl == 'test'){//测试页面的假回调，
      let r = captchaList.some((item)=>{
        console.log("item:",item)
        if(item.scene==token){
          item.state = 1  //验证通过
          return true
        }
      })
      if(r){
        return res.send({
          code: 0,
          data: '验证成功'
        });
      }else{
        return res.send({
          code: 1,
          data: '无效token'
        });
      }
      return 
  }
  else if (callbackUrl) {
    await db.delCode(token)
    exeCallback(callbackUrl, token)
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

});

// 申请二维码
app.get("/mmv/getqr", async (req, res) => {
  console.log("get qrcode:",req.query)

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
  if(user.qrcount>user.verifycount+500){
    return res.send({
      code: 2,
      data: '拒绝：申请的未使用二维码超过'+limit,
    });
  }
  
  let scene = await nanoid();
  scene = scene.slice(0, 32) //微信限制在32位, 虽然nanoid生成的scene明显小于32

  let qrcode = await getQrCode(scene,false)

  if (!qrcode) {
    return res.send({
      code: 3,
      data: '无法获取二维码',
    });
  }
  await db.updateUser(user.openid,{
    qrcount:user.qrcount+1
  })
  await db.addCode(code,user.openid)
  
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
      if(data.host.length>100 || data.callback.length>100|| !regUrl.test(data.callback)){
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
    console.log("注册服务错误：",error)
    return res.send({
      code: 1,
      data: error
    });
  }
});

// 获取用户信息
app.get("/mmv/myinfo", async (req, res) => {
  let openID = req.headers["x-wx-openid"]
  console.log('user:',openID)
 
  let user = await db.getUserByOpenID(openID)
  if(user){
    return res.send({
      code: 0,
      data: {
        skey:user.skey,
        state: user.state,
        host: user.host,
        callback: user.callback
      }
    });
  }else{
    let skey = await nanoid();
    let data= {
      skey,
      openid:openID,
      state: 0,
      host: '',
      callback:''
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
