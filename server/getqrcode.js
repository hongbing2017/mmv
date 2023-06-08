const http = require('http');


async function _GetQr(scene,bDev,n=1) {

    return new Promise((resolve, reject) => {
    
        var postData = {
            'scene': scene,
            'width': 280,
            'page':'pages/index/index',
            'env_version':bDev?'develop':'release',
            'check_path':bDev?false:true
        }
        postData = JSON.stringify(postData);
        //console.log("postData:", postData)

        const options = {
            host: 'api.weixin.qq.com',
            path: `/wxa/getwxacodeunlimit`,
            protocol: 'http:',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length,
            },
        };

        const req = http.request(options, (res) => {
            //console.log(`STATUS: ${res.statusCode}`);
            //console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
            var data = '';
            res.setEncoding('binary');
            res.on('data', (chunk) => {
                data += chunk;
                //console.log(`BODY: ${chunk}`);
            });
            res.on('end', async () => {
                const contentType = res.headers['content-type'];
                if (!contentType || !contentType.includes('image')) {
                    console.log('获取小程序码图片失败，微信api返回的json为：', data?JSON.parse(data):'null')
                    return resolve(0);
                } else {
                    let d = Buffer.from(data, 'binary')

                    let imageBase64 = d.toString("base64")
                    imageBase64 = `data:image/png;base64,${imageBase64}`
                    resolve(imageBase64)
                }
            });
        });

        req.on('error', function (e) {
            console.error(`次数${n} 获取二维码错误: ${e.message}`);
            resolve(0)
            return
        });

        // write data to request body
        req.write(postData);
        req.end();
    })

}

module.exports = async function(scene,bDev){
    let r = await _GetQr(scene,bDev)
    if(!r){
        await new Promise(resove=>setTimeout(resove,1000))
        r = await _GetQr(scene,bDev,2)
    }
    return r
}
