var schedule = require('node-schedule');
var tencentcos = require('./tencentcos.js')

// 从环境变量中读取数据库配置
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");


var knex = null

// 数据库初始化方法
async function initDB() {
  //console.log("开始初始化数据库:", MYSQL_USERNAME, MYSQL_PASSWORD, host,port)
  try {
    knex = await require('knex')({
      client: 'mysql',
      connection: {
        host,
        port,
        user: MYSQL_USERNAME,
        password: MYSQL_PASSWORD,
        database: 'mmv',
        charset: 'utf8',
        multipleStatements: true,
        connectTimeout: 20000
      }
    })

    //console.log("数据库连接：",knex)
    console.log("测试数据库")
    let r = await knex.schema.hasTable('userList')
    console.log("测试结果:",r)

    await knex.schema.hasTable('userList').then(function (exists) {
      if (!exists) {
        console.log("创建表userList")
        return knex.schema.createTable('userList', table => {         
          table.string('skey').primary() //用户api key
          table.string('openid').index()
          table.integer('state') //0=正常 1=异常 2=封禁
          table.string('host')   //用户网站主页
          table.string('callback') //验证码回调 
          table.integer('verifycount').defaultTo(0) //完成验证的次数 
          table.integer('qrcount').defaultTo(0)     //使用二维码的次数， 理论上应该和verifycount相等
          table.string('memo').defaultTo('') //备注
          table.string('other') //备用
          table.timestamp('create_time').defaultTo(knex.fn.now())
          table.timestamp('last_visit_time').defaultTo(knex.fn.now())

        })
      }

    })


    await knex.schema.hasTable('codeList').then(function (exists) {
      if (!exists) {
        console.log("创建表codeList")
        return knex.schema.createTable('codeList', table => {
          table.string('code').primary()
          table.string('openid')   //code属于哪个网站用户
          table.timestamp('create_time').defaultTo(knex.fn.now())
        })
      }
    })
    
    //等待上传确认, 避免文件上传了，但没有完成提交变成没有机会删除的死文件
    await knex.schema.hasTable('uploadList').then(function (exists) {
      if (!exists) {
        console.log("创建表uploadList")
        return knex.schema.createTable('uploadList', table => {
          table.string('id').primary()
          table.timestamp('create_time').defaultTo(knex.fn.now())
        })
      }
    })

    let day = 24 * 60 * 60 * 1000;
    //await knex.schema.dropTableIfExists('fileList')

    await knex.schema.hasTable('fileList').then(function (exists) {
        if (!exists) {
          console.log("创建表fileList")
            return knex.schema.createTable('fileList', table => {
              table.string('id').primary()
              table.string('expireNum').defaultTo('') //限制每天访问次数，格式为：今天时间戳-次数
              table.bigint('expireTime').defaultTo(Date.now()+day)
              table.timestamp('create_time').defaultTo(knex.fn.now())
            })
          }
    })

    schedule.scheduleJob("0 0 0 * * *", async () => {
       let list = await GetExpiredUploadIDList()
       list.forEach(item => {
          tencentcos.DelFile(`${item.id}.txt`)
       }); 
       await knex('fileList').where('expireTime','<',Date.now()).del()
       await knex('userList').where('callback','test').limit(1000).del()
    })
  } catch (error) {
    console.log("init database:",error)
  }

}

function AddUploadID(id){
  return knex('uploadList').insert({id})
}
function DelUploadID(id){
  return knex('uploadList').where('id',id).del()
}
function GetExpiredUploadIDList(){
  //const expiredTime = Date.now() - 24 * 60 * 60 * 1000;
  const expiredTime = Date.now() - 60 * 1000;
  return knex('uploadList').where('create_time','<',expiredTime).select()
}

async function AddFile(id){
  return knex('fileList').insert({
    id
  })
}
async function GetFile(id){
  
  let rows  = await knex('fileList').where('id',id).select()
  if(rows.length>0){
    let r = rows[0]
    console.log("访问文件：",r)
    let curTime = new Date()
    //先检查是否过期
    if(r.expireTime < curTime.getTime()){
      await  knex('fileList').where('id',id).del()
      return false
    }
    //再检查是否超过访问次数
    const today = new Date(curTime.getFullYear(), curTime.getMonth(), curTime.getDate());
    const todayTimestamp = today.getTime();

    let expireNum = r.expireNum.split('-')
    if(!expireNum[0] ||todayTimestamp!=expireNum[0]){
      await knex('fileList').where('id',id).update({
        expireNum:todayTimestamp+'-'+239
      })
      return true
    }

    let n = Number(expireNum[1])
    n--
    if(n==0){
      await  knex('fileList').where('id',id).del()
    }else{
      await knex('fileList').where('id',id).update({
        expireNum:todayTimestamp+'-'+n
      })
    }
    return true
  }
  return false
}
async function AddFileDays(id,days){
  let rows = await knex('fileList').where('id',id).select('expireTime')
  if(rows[0]){
    let t = rows[0].expireTime
    t += days*24 * 60 * 60 * 1000;
    return  knex('fileList').where('id',id).update({
      expireTime:t
    })
  }
}
async function getUser(skey) {
  if(!skey)return null
  let rows = await knex('userList').where('skey', skey).select()
  if (rows && rows[0]) return rows[0]
  return null
}
async function getUserByOpenID(openID) {
  if(!openID)return null
  let rows = await knex('userList').where('openid', openID).select()
  if (rows && rows[0]) return rows[0]
  return null
}
function addUser(data) {
  return knex('userList').insert(data)
}

function updateUser(openID, data) {
  return knex('userList').where('openid', openID).update(data)
}
function delCode(code){
  return knex('codeList').where('code',code).del()
}
function getCode(openID){
  return knex('codeList').where('openID',openID).select()
}
function addCode(code,openID){
  return knex('codeList').insert({
    openid:openID,
    code:code
  })
}
async function verifyCode(token) {
  let rows = await knex('codeList').where("code", token).select()
  if (rows && rows.length == 1) {
    let openID = rows[0].openid
    rows = await knex('userList').where('openid', openID).select()
    if (rows && rows.length == 1) {
      let item = rows[0]
      let callbackUrl = item.callback
      item.verifycount = item.verifycount + 1
      await updateUser(openID, { verifycount: item.verifycount })
      return callbackUrl
    }
  }
  return null
}

// 导出初始化方法和模型
module.exports = {
  initDB,
  verifyCode,
  getUser,
  getUserByOpenID,
  updateUser,
  addUser,
  addCode,
  delCode,
  getCode,
  AddUploadID,
  DelUploadID,
  AddFile,
  GetFile,
  AddFileDays
};
