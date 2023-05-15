// index.js
// 获取应用实例
const app = getApp()
Page({
  data: {
    copyrightInfo: 'version 1.0.0',
    result:null
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
          if(res.data.code==0){
             console.log('验证成功：', res);
            this.setData({
            result:{
              title:"验证成功",
              theme:'success',
              description:'请返回网站继续操作'
            }
            })
          }else{
            console.log('验证失败：', res);
            this.setData({
            result:{
              title:"二维码无效或过期",
              theme:'error',
              description:'请刷新二维码重新验证'
            }
            })
          }
         
        }else{
          this.setData({
            result:{
              title:"网络错误",
              theme:'error',
              description:'请稍后继续尝试'
            }
          })
        }
      } catch (error) {
        console.log("验证失败：", error)
        this.setData({
          result:{
            title:"验证超时",
            theme:'error',
            description:'请重新扫码验证'
          }
        })
      }
    }
  },
  onVisibleChange(){
    this.setData({
      result:null
    })
  },
  async onRegister() {
    // console.log("注册")
    wx.navigateTo({
      url: "../register/register"
    })
  }
})
