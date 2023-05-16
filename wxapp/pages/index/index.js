// index.js
// 获取应用实例
const app = getApp()
Page({
  data: {
    copyrightInfo: 'version 1.0.0'    
  },

  async onLoad(query) {

    console.log("query:",query)
    if(!query || !query.scene)return
    const scene = decodeURIComponent(query.scene)
    if (scene) {
      try {
        const res = await wx.cloud.callContainer({
          "config": {
            "env": "prod-6gzerea72b344d34"
          },
          "path": "/mmv/verify?token="+scene,
          "header": {
            "X-WX-SERVICE": "server"
          },
          "method": "GET"
        });
  
        if (res.statusCode == 200) {
          console.log()
          if(res.data.code==0){
             console.log('验证成功：', res);
             this.gotoResult('验证成功','success','请返回网站进行下一步操作')
            
          }else{
            console.log('验证失败：', res);
            this.gotoResult('二维码无效或过期','error','请刷新二维码重新验证')
          }
         
        }else{
          this.gotoResult('网络错误','error','请稍等几秒重新尝试')
        }
      } catch (error) {
        console.log("验证失败：", error)
        this.gotoResult('验证超时','error','请重新扫描验证')
      }
    }
  },
  onVisibleChange(){
    this.setData({
      result:null
    })
  },
  gotoResult(title,theme,description){

    wx.navigateTo({
      url:`../result/result?title=${title}&theme=${theme}&description=${description}`
    })
  },
  async onRegister() {
    // console.log("注册")
    wx.navigateTo({
      url: "../register/register"
    })
  }
})
