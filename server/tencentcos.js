
var STS = require('qcloud-cos-sts')
var COS = require('cos-nodejs-sdk-v5');

const {SECRET_ID, SECRET_KEY,BUCKET,REGION } = process.env

var cos = new COS({
    SecretId: SECRET_ID,
    SecretKey: SECRET_KEY
});

const Bucket = BUCKET
const Region = REGION

function TencentCosAuth(fileMD5){

    var config = {
        secretId: SECRET_ID, //用的子账号zhb
        secretKey: SECRET_KEY,
        proxy: '',
        durationSeconds: 1800,
      
        // 放行判断相关参数
        bucket: BUCKET,
        region: REGION,
        //allowPrefix: 'test/*', // 这里改成允许的路径前缀，可以根据自己网站的用户登录态判断允许上传的具体路径，例子： a.jpg 或者 a/* 或者 * (使用通配符*存在重大安全风险, 请谨慎评估使用)
        // 简单上传和分片，需要以下的权限，其他权限列表请看 https://cloud.tencent.com/document/product/436/31923
        allowActions: [
          "name/cos:HeadObject",
          // 简单上传
          'name/cos:PutObject',
          'name/cos:PostObject',
          // 分片上传
          'name/cos:InitiateMultipartUpload',
          'name/cos:ListMultipartUploads',
          'name/cos:ListParts',
          'name/cos:UploadPart',
          'name/cos:CompleteMultipartUpload'
        ],
      };

       // 获取临时密钥
    let buckets = config.bucket.split('-')
    var shortBucketName = buckets[0]
    var appId = buckets[1]

      var policy = {
        'version': '2.0',
        'statement': [{
            'action': config.allowActions,
            'effect': 'allow',
            'principal': {'qcs': ['*']},
            'resource': [
                'qcs::cos:' + config.region + ':uid/' + appId + ':prefix//' + appId + '/' + shortBucketName + '/*'
            ],
        }],
    };

      return new Promise((resolve)=>{
        STS.getCredential({
            secretId: config.secretId,
            secretKey: config.secretKey,
            proxy: config.proxy,
            durationSeconds: config.durationSeconds,
            policy: policy,
          }, function (err, tempKeys) {    
            if(err){
                resolve(null)
            }
            else{
                resolve(JSON.stringify(tempKeys))
            }
          });
      })
            
}

function InitBucket() {
    cos.headBucket({
        Bucket,
        Region,
    }, function(err, data) {
        if (data) {
            console.log('存储桶存在');
        } else if (err.statusCode == 404) {
            console.log('存储桶不存在');
            cos.putBucket({
                Bucket,
                Region
            }, function(err, data) {
                if(!err){
                    console.log("创建存储桶：",Bucket)
                }
            });
        } else if (err.statusCode == 403) {
            console.log('没有该存储桶读权限');
        }
    });
}


function DirList(dir,marker) {
    cos.getBucket({
        Bucket,
        Region,
        Prefix: dir,
        Marker: marker,
    }, function(err, data) {
        if (err) {
            return console.log('list error:', err);
        } else {
            console.log('list result:', data.Contents);
            if (data.IsTruncated === 'true') listFolder(data.NextMarker);
            else return console.log('list complete');
        }
    });
};
//DirList('test/')

function GetFile(file){
    return new Promise(resolve=>{
         cos.getObject({
        Bucket,
        Region,
        Key: file
    }, function(err, data) {
        if(!err){
            resolve(data.Body.toString())
        }else{
            console.log("获取COS文件错误：",file,err)
            resolve(null)
        }
    });
  })   
}

function DelFile(file){
    cos.deleteObject({
        Bucket,
        Region,
        Key: file
    }, function(err, data) {
        if(data && data.statusCode != 404){
            console.log("删除COS文件成功：",file)
        }else{
            console.log("删除COS文件错误：",file,err)
        }
    });
}

//DelFile('test/12(1)(2).PNG')

function DeleteDir(dir,marker) {
    cos.getBucket({
        Bucket,
        Region,
        Prefix: dir,
        Marker: marker,
        MaxKeys: 1000,
    }, function (listError, listResult) {
        if (listError) return console.log('list error:', listError);
        var nextMarker = listResult.NextMarker;
        var objects = listResult.Contents.map(function (item) {
            return {Key: item.Key}
        });
        cos.deleteMultipleObject({
            Bucket,
            Region,
            Objects: objects,
        }, function (delError, deleteResult) {
            if (delError) {
                console.log('delete error', delError);
            } else {
                console.log('delete result', deleteResult);
                if (listResult.IsTruncated === 'true') DeleteDir(nextMarker);
                else console.log('delete complete:',dir);
            }
        });
    });
}
//DeleteDir('test/');


module.exports = {
    InitBucket,
    DirList,
    DelFile,
    GetFile,
    DeleteDir,
    TencentCosAuth
}