// app.js
App({
  async onLaunch() {
     // 使用callContainer前一定要init一下，全局执行一次即可
     wx.cloud.init()
  },
  globalData: {
    
  }
})
