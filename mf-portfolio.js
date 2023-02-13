(function (func) {
  about = 'mf-portfolio.js Copyright 2023 t-bucchi' // eslint-disable-line no-undef

  // Moneyforward の「資産」のページ以外、もしくは一度実行済みなら終了
  if (location.href !== 'https://moneyforward.com/bs/portfolio' ||
    $('#class-graph').length > 0) {
    return
  }

  // Plotly をロードする
  const script = document.createElement('script')
  script.src = 'https://cdn.plot.ly/plotly-latest.min.js'
  script.onload = func // ロード後に関数を実行
  document.getElementsByTagName('head')[0].appendChild(script)
})(function () {
  /* この関数は Plotly がロードされたあとに実行される */

  // Plotly の描画領域を追加
  $('#bs-portfolio .row:nth-child(1)').after('<section><h1 class="heading-normal">ポートフォリオ</h1><section><div id="class-graph" /></section></section>')

  /* Utility functions */
  function strToInt (str) {
    str = str.replace(/[,， 　円\\]/g, '') // eslint-disable-line no-irregular-whitespace
    if (str === '') {
      return 0
    }
    return parseInt(str)
  }

  function normalizeZenkaku (str) {
    str = str.replace(/　/g, ' ') // eslint-disable-line no-irregular-whitespace
    return str.replace(/[！-～]/g, function (s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    })
  }

  /* Parse asset table */
  class Parser {
    static ColumnType = {
      ignore: 0,
      amount: 1,
      name: 2,
      profit: 3,
      account: 4
    }

    constructor (id) {
      this.type = $(id + ' > h1').text()
      this.type_order = []
      this.rows = []

      $(id + ' tr').each(function (self) {
        return function (i, e) {
          self.parse(e)
        }
      }(this))
    }

    getRows () {
      return this.rows
    }

    parse (tr) {
      // console.log(this.type_order)
      // console.log(tr)
      /* th だった場合は parse 順を解析して type_order に保存 */
      const th = $(tr).find('th')
      if (th.length > 0) {
        th.each(function (self) {
          return function (i, e) {
            // console.log(i, $(e).text())
            switch ($(e).text()) {
              case '種類・名称':
              case '銘柄名':
              case '名称':
                self.type_order.push(Parser.ColumnType.name)
                break
              case '残高':
              case '評価額':
              case '現在価値':
                self.type_order.push(Parser.ColumnType.amount)
                break
              case '評価損益':
                self.type_order.push(Parser.ColumnType.profit)
                break
              case '保有金融機関':
                self.type_order.push(Parser.ColumnType.account)
                break
              default:
                self.type_order.push(Parser.ColumnType.ignore)
                break
            }
          }
        }(this))
        return
      }

      const td = $(tr).find('td')
      if (td.length === 0) {
        return
      }

      const row = {
        account: '',
        name: '',
        amount: 0,
        profit: 0,
        genre: ''
      }
      /* td だった場合は type_order に合わせて parse */
      td.each(function (self, row) {
        return function (i, e) {
          // console.log(i, $(e).text(), self.type_order[i])
          switch (self.type_order[i]) {
            case Parser.ColumnType.name:
              row.name = normalizeZenkaku($(e).text())
              break
            case Parser.ColumnType.amount:
              row.amount = strToInt($(e).text())
              break
            case Parser.ColumnType.profit:
              row.profit = strToInt($(e).text())
              break
            case Parser.ColumnType.account:
              row.account = normalizeZenkaku($(e).text())
              break
          }
        }
      }(this, row))

      if (this.type === '年金' && row.account === '') {
        row.account = '年金'
      }

      /* 資産クラスを推定して設定する */
      row.genre = this.estimateGenre(row)
      this.rows.push(row)
    }

    estimateGenre (row) {
      const doller = /ドル/
      const stock = /株|TOPIX|日経/
      const bond = /債/
      const reit = /REIT|リート|不動産/
      const world = /世界/
      const developed = /先進|米国|外国/
      const domestic = /国内|日本|TOPIX|日経/
      const emerging = /新興/
      const mmf = /マネー.*マーケット.*ファンド|MMF/

      switch (this.type) {
        case '預金・現金・暗号資産':
          if (doller.test(row.name)) {
            return '外貨'
          } else {
            return '日本円'
          }

        case '株式（現物）':
          return '日本株式'

        case '投資信託':
        case '年金':
        {
          // 米ドルMMFの特殊ケース
          if (mmf.test(row.name) && doller.test(row.name)) {
            return '外貨'
          }
          // 元本保証商品の特殊ケース
          if (/保険/.test(row.name)) {
            return '日本円'
          }

          let area = ''
          let class_ = ''
          if (world.test(row.name)) {
            area = '世界'
          } else if (developed.test(row.name)) {
            area = '先進国'
          } else if (emerging.test(row.name)) {
            area = '新興国'
          } else if (domestic.test(row.name)) {
            area = '日本'
          }

          if (stock.test(row.name)) {
            class_ = '株式'
          } else if (bond.test(row.name)) {
            class_ = '債券'
          } else if (reit.test(row.name)) {
            class_ = 'REIT'
          } else {
            class_ = 'その他リスク資産'
          }
          return area + class_
        }

        case '債券':
          if (doller.test(row.name)) {
            return '米国債券'
          }
          return '日本債券'

        default:
          return 'unknown'
      }
    }
  }

  // 資産状況を sunburst 形式に変換するクラス
  class AssetGraph {
    constructor (asset) {
      this.items = {}
      this.total = 0
      this.parent = {
        Total: '',
        非リスク資産: 'Total',
        リスク資産: 'Total',
        株式: 'リスク資産',
        債券: 'リスク資産',
        REIT: 'リスク資産',
        その他: 'リスク資産',
        バランス: 'リスク資産',
        コモディティ: 'リスク資産',
        金: 'コモディティ',
        ETF: 'リスク資産',
        海外ETF: 'リスク資産',
        日本円: '非リスク資産',
        外貨: 'リスク資産',
        その他リスク資産: 'リスク資産'
      }

      asset.forEach(function (row) {
        this.add(row)
      }, this)
    }

    getParent (str) {
      // console.log('getParent', str)
      if (str in this.parent) {
        return this.parent[str]
      }

      let result = ''
      if (/株式/.test(str)) {
        result = '株式'
      } else if (/債券/.test(str)) {
        result = '債券'
      } else if (/REIT/.test(str)) {
        result = 'その他リスク資産'
      }
      self.parent[str] = result
      return result
    }

    add (row) {
      // console.log('add', row)
      this.total += row.amount
      if (row.name in this.parent === false) {
        this.parent[row.name] = row.genre
      }
      this.add_sub(row.name, row.amount, row.profit)
    }

    add_sub (name, amount, profit) {
      // console.log('add_sub', name, amount, profit)
      const parent = this.getParent(name)
      if (name in this.items === false) {
        // assetに存在しなければ追加
        this.items[name] = {
          parent,
          name,
          amount: 0,
          profit: 0
        }
      }
      const item = this.items[name]
      item.amount += amount
      item.profit += profit
      if (parent !== '') {
        this.add_sub(parent, amount, profit)
      }
    }

    graphdata () {
      const labels = []
      const parents = []
      const values = []
      const text = []
      const hovertext = []
      const color = []
      // text = '{:,d}<br />{:.2f}%({:.2f}%)'.format(int(value), value / parent_value * 100, value / self.total * 100)
      // hover = '{:.2f}%({:.2f}%)'.format(value / parent_value * 100, value / self.total * 100)

      for (const key in this.items) {
        const item = this.items[key]
        const parentAmount = item.parent ? this.items[item.parent].amount : this.total
        const percentByParent = (item.amount / parentAmount * 100).toFixed(1) + '%'
        const percentByTotal = (item.amount / this.total * 100).toFixed(1) + '%'
        const profit = (item.profit > 0 ? '+' : '') + item.profit.toLocaleString() + ' ' +
          (item.profit > 0 ? '+' : '') + (item.profit / (item.amount - item.profit) * 100).toFixed(1) + '%'
        // console.log(item)
        labels.push(item.name)
        parents.push(item.parent)
        values.push(item.amount)
        let t = item.amount.toLocaleString()
        let h = profit
        if (item.name !== 'Total') {
          t += '<br />' + percentByParent + ' (' + percentByTotal + ')'
          h = percentByParent + '% (' + percentByTotal + ')<br />' + h
        }
        text.push(t)
        hovertext.push(h)
        color.push(this.getColor(item.name))
      }
      return [{
        type: 'sunburst',
        labels,
        parents,
        values,
        text,
        hovertext,
        branchvalues: 'total',
        outsidetextfont: { size: 20, color: '#377eb8' },
        marker: { line: { width: 2 }, colors: color }
      }]
    }

    getColor (name) {
      if (name === 'Total') {
        return '#fff'
      } else if (name === '非リスク資産') {
        return '#27f'
      } else if (name === 'リスク資産') {
        return '#f44'
      } else if (/株式/.test(name)) {
        return '#f44'
      } else if (/債券/.test(name)) {
        return '#f82'
      } else if (/その他/.test(name)) {
        return '#fc4'
      } else if (/外貨/.test(name)) {
        return '#fe0'
      }
      const parent = this.getParent(name)
      console.log(name, parent)
      if (parent !== '') {
        return this.getColor(parent)
      }
      return '#888'
    }
  }

  function parseAsset (list) {
    let items = []
    list.forEach(function (v) {
      const p = new Parser(v)
      items = items.concat(p.getRows())
    })
    return items
  }

  const asset = parseAsset([
    '#portfolio_det_depo',
    '#portfolio_det_eq',
    '#portfolio_det_mf',
    '#portfolio_det_bd',
    '#portfolio_det_pns'])
  // console.log(asset)

  const a = new AssetGraph(asset)
  // console.log(a)
  const data = a.graphdata()
  // console.log(data)
  const layout = {
    margin: { l: 0, r: 0, b: 0, t: 0 },
    width: 700,
    height: 700
  }
  Plotly.newPlot('class-graph',  // eslint-disable-line
    data, layout,
    { displayModeBar: false })
})
