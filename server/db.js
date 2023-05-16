
// 从环境变量中读取数据库配置
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");


var knex = null

// 数据库初始化方法
async function initDB() {
  console.log("开始初始化数据库:", MYSQL_USERNAME, MYSQL_PASSWORD, host,port)
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
  } catch (error) {
    console.log("init database:",error)
  }

}
async function getUser(skey) {
  let rows = await knex('userList').where('skey', skey).select()
  if (rows && rows[0]) return rows[0]
  return null
}
async function getUserByOpenID(openID) {
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
  getCode
};
