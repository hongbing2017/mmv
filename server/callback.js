const axios = require('axios');

// 定义一个空数组来存储回调数据
let callbackList = []

// 往列表中添加回调URL和参数code
function ExeCallback(url, code) {
    callbackList.push({url, code,n:0})
}
function delCallback(code){
    callbackList.some((item,index)=>{
        if(item.code==code)callbackList.splice(index,1)
        return true
    })
}
setInterval(() => {
    let list = callbackList.slice()
    for(let item of list){
        if(item.n==0 || item.n==5 ||item.n==10){
            axios.get(`${item.url}?code=${item.code}`).then(res=>{
                if(res.statusCode ==200){
                    delCallback(item.code)
                }
            })
        }
        item.n++
        if(n>12){
            delCallback(item.code)
        }    
    }
}, 1000);

module.exports = ExeCallback
