tab session version control system

- tession
    - **t**ab s**ess**ion ver**sion** control system
- tersion
    - **t**ab s**e**ssion ve**rsion** control system
- tev
    - **t**ab s**e**ssion **v**ersion control system


为什么用 git 来作为 vcs
- 相比 手撸
    - 我最早时候直觉上就已经是将 tab/session的版本管理 跟 git 联想到一起的了
    - 能直接复用很多功能算法, 省工夫, 毕竟本身只是我兴起的一个折腾
    - 正好能复习一下 git
    - 正好能折腾一波 use git in browser js
    - 正好能折腾一波 webextension 和 前端 (npm, webpack)
    - (后来发现还) 正好能折腾一波 WebAssembly (wasm, emscripten)
    - 反正目前看下来应该也还合用/够用?
- 相比 其他 受推荐/新出现 的DVCS (比如 Pijul, Jujutsu, Fossil)
    - 暂时没必要去学吧,
        - 内在来说, 我已经有很多兴趣点了, 精力有限
        - 外在来说, 现在 以及 可预见的未来, git 还会是主流吧


为什么选 tab as file 而非 window/session as file :
- pros
    - 模型和语义上确实也更切合 tab和tab之间的关系 以及 tab在tree/session里的位置 等
    - 方便 diff
        - tab能具有更好的原子性, 不至于误伤其他内容
    - 检索历史的时候
        - 同一个window下, 只要 整棵tree 本身并无变动, 那么就天然不会产生变动; 也即 天然能尽量约束 改动范围
        - 方便 复用 'file rename' 和 `git log --follow`, 跟踪 'tab本身无变动,但所属的tree有了变动' 的情况
        - [ ] 好像还有可能比较简单的适配跟踪 'tab本身有轻微变动,且所属的tree有了变动' 的情况:
            - 考虑 针对 同一个版本的session , 可以拆分成 '共享同一个id的前后相邻两个commit': 第一个专门用于记录(位置和/或顺序)移动, 第二个就是所有正常的增删改
            - [ ] 考虑 自定义 相似度检查标准 ? (暂未细究)
                - ref: https://stackoverflow.com/questions/2314652/is-it-possible-to-move-rename-files-in-git-and-maintain-their-history#comment14397040_2314745
        - [ ] 好像还有可能适配其他特殊的变动情况 ? (暂未细究)
            - [ ] 考虑 (recommended by git officially) tool `git-filter-repo`
                - ref: https://stackoverflow.com/questions/2314652/is-it-possible-to-move-rename-files-in-git-and-maintain-their-history/61298590#61298590
            - [x] NOTE: [围绕 `file(path) rename tracking` 我也有做了些笔记汇总](https://gist.github.com/ajaegers/2a8d8cbf51e49bcb17d5?permalink_comment_id=4909514#gistcomment-4909514)
- cons
    - 性能问题, 文件数量可能会膨胀过快:
        - 空间占用过大? git操作变慢?
            - [x] 不过应该怎么也不至于到 linux内核 repo 的量级
                - ref: https://stackoverflow.com/questions/56335249/i-have-a-lot-of-source-files-to-add-to-a-git-repo-how-to-make-it-fast
                - ref: https://stackoverflow.com/questions/66858409/improving-performance-of-git-repo-with-hundreds-of-thousands-of-small-files
            - [x] ? tab 一旦关闭后就自然消亡了, 所以宏观分析的时候大致还是只基于 任意时刻的session内最大'tab数+非叶子节点tab数'(或者干脆'两倍tab数') 来评估就好
        - 要读取所有tab的内容时, 就要读取(当前版本session里的)所有文件 ...
            - [ ] 实测一下?


具体思路
- 每个tab的各项属性
    - 非叶子节点tab 对应 `目录名`+`.tab文件内容`
    - _ 叶子节点tab 对应 `文件名`+`文件内容`
        - [ ] 考虑 甚至放弃特化'叶子节点',而统一使用 `.tab`文件 ?
            - 这样 当一个'叶子节点'变为'非叶子节点'的时候, 变动会少一些
- tab对应的`目录名`和`文件名`
    - 特定的前缀 `tab` ?
    - [ ] 好像 git 可以支持最多4KB长度的文件名? 最长路径呢? (之前大概搜了下, git-scm.com 里倒是居然没搜着)
        - [ ] 那要不就 直接把url等基本属性都放在文件/目录名 得了? 正好还可以用上之前兴起找到的各种unicode
        - [ ] 性能影响?
    - [x] wasm idbfs 小试了下好像确实可以保存 由五千个数字组成的文件名
- 同一层级的多个节点 的 相对顺序
    - 要不直接建数据库管理吧? 用 浮点数牛顿法 啥的
        - 但这样似乎就不太应该使用超长的文件/目录名了, 毕竟既然作为id那么在数据库里也至少要再存一份的
        - 除非直接放在每个目录下, 不然就必然无法避免 'id太长重复存放太浪费' 的问题
    - 把顺序信息放在每个文件内容里?
        - 如果用 浮点数牛顿法 啥的, 倒也不用担心每次变动都需要影响其他tab
        - 而且也必然可以让 git diff 的时候区分处理
            - [x] 最起码, 可以固定使用第一行来记录顺序信息, 这样也方便识别/忽略
            - [x] 而且也明确已有类似的功能: https://stackoverflow.com/questions/53451455/git-diff-ignore-lines-starting-with-a-word
        - 但是这样的话, 对于 'tab的位置/顺序有所移动' 的情况, 虽然 文件在不同目录间的移动 和 其内顺序信息的更新 是大概率会一并出现的变动, 但就必须要拆分在两个commit里了 (否则 git 无法 detect rename 嘛)
            - [ ] 考虑 针对 同一个版本的session , 拆分成 三个commit 而非 两个
                - 毕竟如果 顺序信息的更新 和 其他信息的更新 合并在同一个commit 里的话, 那么就还需要(每一次都?)专门区分处理
            - 其实就算是用数据库的方案, 对于 'tab的位置/顺序有所移动' 的情况, 也是同样可能需要更新顺序信息的嘛
