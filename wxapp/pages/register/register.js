// logs.js
const util = require('../../utils/util.js')

let _tempInfo = null
Page({
  data: {
    state: 0,
    host:'',
    callback:'',
    skey: '',
    github: 'https://github.com/hongbing2017/wxmmv'
  },
  async onLoad() {
    console.log("注册服务")

    try {
      wx.showLoading({
        mask: true
      })
      const res = await wx.cloud.callContainer({
        "config": {
          "env": "prod-6gzerea72b344d34"
        },
        "path": "/mmv/myinfo",
        "header": {
          "X-WX-SERVICE": "server"
        },
        "method": "GET"
      })
      wx.hideLoading();
      if (res.statusCode == 200) {
        if (res.data.code == 0) {
          let  data = res.data.data
          console.log("myinfo:",data)
          this.setData(data)
          _tempInfo = data
          return
        } 

      } 
      wx.showModal({
        title: '提示',
        content: `网络错误，请稍后重试`,
        showCancel: false,
        success: function (res) {
          if (res.confirm) {
            wx.navigateBack({
              delta: 1
            })
          }
        }
      })
    } catch (error) {
      wx.hideLoading();
      wx.showModal({
        title: '提示',
        content: `网络错误，请稍后重试`,
        showCancel: false,
        success: function (res) {
          if (res.confirm) {
            wx.navigateBack({
              delta: 1
            })
          }
        }
      })
    }
  },
  onInput(e){
    let type = e.currentTarget.dataset.type
    this.setData({
      [type]:e.detail.value
    })
  },
  onCopyAPIKEY() {
    wx.setClipboardData({
      data: this.data.skey,
      success(res) {
        wx.getClipboardData({
          success(res) {
            console.log(res.data) // data
          }
        })
      }
    })
  },
  onCopyUrl() {
    wx.setClipboardData({
      data: this.data.github,
      success(res) {
        wx.getClipboardData({
          success(res) {
            console.log(res.data) // data
          }
        })
      }
    })
  },
  async onRegister(){
    let reg = /^(http|https):\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}(\/[a-zA-Z0-9/_.-]*)*$/
    //console.log(reg.test('https://zhb.link/eaf'))
    let reg2 = /[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}(\/[a-zA-Z0-9/_.-]*)*$/

    if(!reg2.test(this.data.host)){
      wx.showModal({
        title: '提示',
        content: '请填写有效的主页',
        showCancel: false
      })
      return
    }

    if(!reg.test(this.data.callback)){
      wx.showModal({
        title: '提示',
        content: '请填写有效的回调',
        showCancel: false
      })
      return
    }

    if(_tempInfo &&_tempInfo.host == this.data.host && _tempInfo.callback == this.data.callback){
      console.log("没有改变，无须提交")
      return
    }
    try {
      wx.showLoading({
        mask: true
      })
      const res = await wx.cloud.callContainer({
        "config": {
          "env": "prod-6gzerea72b344d34"
        },
        "path": "/mmv/register",
        "header": {
          "X-WX-SERVICE": "server"
        },
        "method": "POST",
        "data":{
          host:this.data.host,
          callback:this.data.callback
        }
      })
      wx.hideLoading();
      if (res.statusCode == 200) {
        if (res.data.code == 0) {
          let  data = res.data.data
          this.setData(data)
          wx.showModal({
            title: '提示',
            content: `提交成功`,
            showCancel: false,
            success: function (res) {
             
            }
          })
          return
        } 

      } 
      wx.showModal({
        title: '提示',
        content: `注册失败，请稍后重试`,
        showCancel: false,
        success: function (res) {
         
        }
      })
    } catch (error) {
      wx.hideLoading();
      wx.showModal({
        title: '提示',
        content: `网络错误，请稍后重试`,
        showCancel: false,
        success: function (res) {
         
        }
      })
    }
  }
})
