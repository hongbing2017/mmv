# 用小程序替代验证码实现人机验证


通常一个网站会使用图片验证码来验证用户是一个真实人类，防止机器人刷服务，薅羊毛，消耗资源。
    
但随着AI识别能力提高，简单的图片验证码已经很容易被破解，过于复杂的验证码又会让真实用户很难使用。

但是，用户用微信扫码并唤醒小程序这个行为是很难伪造的，因此可以用这个行为来检测用户的真实性。

原理很简单：小程序给网站按需提供不限量的二维码，用户微信扫码唤醒本小程序，本小程序向网站后台发送通知，网站后台授权前端继续提供服务。

除了扫码行为，本验证方案不需要用户做任何其它操作，也无须用户提供任何信息。

而网站需要做的就是在本小程序注册自己的服务，并提供一个回调网址。

人机验证小程序作为基础工具提供免费服务，小程序和后端代码都在此开源。

在线演示：https://myfile.link/mmv/index

实际应用案例：https://myfile.link

# 如何在自己的网站中使用


假设你已经拥有一个网站，并需要验证码服务，只需要三步就可给自己的网站提供人机验证。

## 1 登记网站

请用微信扫码扫码或者搜索人机验证小程序。

![二维码](./qr.png)

打开小程序后，登记自己的网站，也就是提供一个回调url，这个回调url用于接受小程序后台通知网站已经扫码某个二维码。

登记会立时生效，同时你会得到一个skey，用于你的网站后台向程序后台申请二维码。

## 2 调用API申请二维码并在前端展示

每当你需要验证用户的真实性时，在你的网站后台用以下API申请一个二维码

API：https://myfile.link/getcaptcha?skey=xxxx (把xxx替换成你自己的skey)

调用结果：
```JS
{
    code:0,
    data:{
        qrcode, //二维码图像，格式为："data:image/png;base64,xxxxxx"
        captcha //此二维码的扫码值
    }
}
```

把二维码发给前端显示

```html
 <img  src="{{qrcode}}"></img>
```

## 3 处理回调

如果用户拿微信扫了二维码，无须其它操作，微信会调起人机验证小程序，小程序会自动按网站注册的回调url发出通知

假设你注册的回调url为：https://mywebsite.com/captcha，

那么你的网站会收到类似这样的通知：https://mywebsite.com/captcha?code=xxx

其中code就是之前申请二维码时得到的captcha，根据这个captcha你可以认定某二维码已经被真实人类使用，从而授权其所指向的用户可以进行下一步操作

```js
//类似这样
app.get("/captcha", async (req, res) => {
  const {code}=req.query 
  
  //根据code做something
  ...

  //一定要返回响应信息
  res.json({
    code:0
  })
});
```

请确保你的网站后台正确响应这个回调并返回200，否则小程序后台会按5秒间隔最多通知三次。

# 最佳实践

有图形验证码实践经验的人已经可以根据上述信息重构自己的人机验证系统。

这里给出一些参考代码。

重点是：在前端部分，我们采用长轮询（Long polling）方案，而不是使用setInterval定时询问后端扫码结果，这样可以把询问频度控制在50秒左右，同时用户一旦扫码又能立即通知前端。参考资料：https://zh.javascript.info/long-polling

假设你的前端已经显示二维码，可以用以下代码询问并等待后端通知用户扫码结果：

```js
//util.js
export function waitAuth(md5,n=0) {
  let url = _host + `/captcharesult?token=${md5}`

  if(n>20)return {
    code:1 //二维码超时
  }
  return new Promise((resolve) => {
    var xhr = new XMLHttpRequest()
    xhr.open('get', url)
    xhr.send()
    xhr.onreadystatechange = async function () {
      if (this.readyState === 4) {
        if(this.status == 502 || this.status==400){
           let r = await waitAuth(md5,n+1)
           resolve(r)
        }
        else if (this.status === 200) {
          let data = JSON.parse(this.response)
          resolve(data)
        } else {
          console.log("captcharesult err:", this.response)
          await new Promise(rs => setTimeout(rs, 1000));
          let r = await waitAuth(md5,n+1);
          resolve(r)
        }
      }
    }
  })
}

//index.js

//其它业务逻辑
...

let r = await util.waitAuth(md5)
if(r.code==1){
    this.$msgbox({
      title: "提示",
      message: '人机验证二维码超时，请重试'
    })
    this.qrcode = ''
    this.bShowCaptcha = false
    return
}

//扫码验证通过，用户可进行下一步操作
...

```

现在转到后端，假设你已经申请到二维码，并把它保存到一个列表_captchaList里等待用户扫码

```js
_captchaList.push({
    md5,      //二维码的MD5，我们可以把这个给前端，让它作为询问结果的凭据
    scene,    //二维码的具体内容
    state: 0, //验证结果0=未验证，1=验证成功
    t: Date.now() 
})
```

处理前端发来的轮询：

```js
app.get("/captcharesult", async (req, res) => {

  const { token } = req.query //二维码的MD5
  console.log("captcharesult token：", token)

  let bHas = _captchaList.some( (item) => {
    if (item.md5 == token) {
      return true
    }
  })

  if(!bHas){
    return res.json({
      code: 1,  //code=1 我们用这个通知前端需要重新获取二维码认证
      result: 0
    })
  }

  //长轮询方案就是一直等用户扫码直到连接超时断连
  req.on('close', function() {
    _captchaList.some((item,index) => {
      if (item.md5 == token) {
        if(item.resolve){
          item.resolve(0)
          item.resolve=null
        }
        //_captchaList.splice(index,1) 不能删除，因为客户端会重新发起连接询问
        return true
      }
    })
  });

  //在这等着扫码验证，连接超时关闭客户端会重新发
  //console.log("等待扫码验证")
  let r = await new Promise(resolve=>{
    _captchaList.some( (item) => {
      if (item.md5 == token) {
        item.resolve=resolve
        return true
      }
    })
  })

  //console.log("扫码验证完成：",r)
  if(r==0)return //表示连接超时断连，不处理

  if(r==-1){ //二维码超时则通知前端刷新二维码
    return res.json({
      code: 1,  //code=1表示刷新
      result: 0
    })
  }

  //这里已经扫码成功，用户可以实现其它业务逻辑，比如myfile.link同时进行对象存储授权
  /*
  console.log("开始对象存储授权")
  let result = await tencent.TencentCosAuth(token)
  console.log("对象存储授权结果：",!!result)

  if(!result){
      return res.json({
        code: 0,
        result: 0
      })
  }
   */ 
  return res.json({//通知前端验证成功,并且附上其它继续操作所需数据
    code: 0,
    result: 1,
    data:result
  })
});

```

当然后端还需要处理人机验证小程序发来的回调，假设你注册的回调为：htts://mysite.com/captcha

那么你可以这样处理回调：

```js

app.get("/captcha", async (req, res) => {
  const { code } = req.query

  let r = _captchaList.some((item) => {
    if (item.scene == token) {
      item.state = 1  //验证通过
      return true
    }
  })
    
  return res.send({
      code: 0,
      data: '验证成功'
  });
  
});
```

你可能注意到处理回调时，只是简单改变了state的状态，并没有调用resolve,这是因为我们建议在一个全局setInterval函数里处理：

```js
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
```
好处如代码所示，我们每隔一秒检查state状态，并调用resovle，这样前端发来的/captcharesult轮询就可以得到响应，同时可以检查二维码是否超时，超时则删除。

你可以能注意到被注释掉的_captchaList.splice(i,1)，那么剩下的删除机会就只剩下超时， 在超时之前，你可以让前端后面的每一步操作都带上二维码的md5，在_captchaList里查找验证其操作是否合法，这属于业务细节，已经跟人机验证没关系。


## 容错处理

**如果网站申请二维码失败怎么办？**

二维码可以按需不限数量的申请（依据目前微信小程序的官方政策）。

尽管申请失败这种情况会很少发生，但却不能保证不会发生。

人机验证的目的是防止机器人大规模薅羊毛或攻击，并不需要次次使用都验证。

所以，一旦偶发这种情况，你可选择直接放行用户，也可以预先申请一定数量的二维码，人机验证小程序允许用户至多预先申请500个。


**二维码可以重复使用吗**

理论是可以的，假设你网站申请了500个二维码循环使用，这500个都被人知道了也不能伪造请求，因为它还是需要用手机微信扫码才能让后台认证这个二维码的状态，这就是它相比于其它图片验证码优势的地方。

但是要防止不同用户同时用一个二维码的情况。




