# 表单流程与表单渲染器对接约定（草案）

更新时间：2026-09-05。读者：表单模板/渲染器开发者、作业流程开发者。
知识基线：0.3.12。本文是内部研发草案，不是已完成运行时接口的承诺。

## 1. 先看结论

表单模板负责“有什么字段、如何展示和录入”；流程负责“谁在什么阶段可以操作”；作业流程的表单填写节点负责把两者绑定，并配置具体字段的例外权限。

建议表单渲染器只接收已经计算好的最终权限，不自行解析部门、角色、流程图或权限组。权限计算与后端提交校验由业务运行时承担。此分工是本草案的对接建议，尚未冻结成正式 API。

```text
可复用表单流程版本 ── 节点主体、默认权限、按钮/签署配置 ─┐
                                                        ├─ 业务运行时（待串通）
作业表单填写节点 ── 表单版本、流程版本、真实字段例外 ────┤    ↓
当前用户 + 实例/节点/任务状态 + 表单数据 ────────────────┘ 最终字段权限
                                                             ↓
                                                    表单渲染器展示与录入
                                                             ↓
                                                    后端校验、保存与推进
```

人员选择与解析的现有调用方式见 [公共主体选择器与解析器](subject-selector-resolver-integration.md)。

## 2. 已确认的业务规则

以下为 `user-confirmed`，来自当前讨论及 DEC-0023、DEC-0033，并非声明运行时全部完成。

- 一个表单流程可复用于多个表单，不在表单流程设计时绑定真实表单字段。
- 一个作业表单填写节点固定引用一个表单模板版本和一个已发布表单流程版本。
- 填报阶段可以配置多个权限组，每组选择用户、部门或角色，并设置默认 `EDIT`（全部可编辑）或 `READ_ONLY`（全部只读）。
- 审批阶段在审批节点配置主体和统一默认权限；绑定具体表单后可按主体设置字段例外。
- 没有例外的字段继承默认权限；默认可编辑时只挑例外只读字段，默认只读时只挑例外可编辑字段。不需要把所有字段逐个分组。
- 同一人命中多个权限来源时，用户已接受只读优先的方向。建议先计算各来源的默认权限及例外，再逐字段合并，不能让任一来源可编辑就覆盖另一来源只读；这一精确计算顺序为草案建议，仍需随运行时契约冻结。
- 未配置填报权限组/审批主体代表所有已认证用户可按流程状态操作，不需要枚举全量用户。配置了主体但已失效、解析失败或没有有效成员，不等于未配置，不能自动放开。
- 任一候选人审批即可完成该审批节点；顺序审批使用多个节点。第一版无拒绝动作，退回目标为填报阶段；表单子流程与外层作业同步，子流程终止时外层也终止。这些完整生产编排仍待实现。
- 不再要求字段槽位、流程字段、业务字段分类或字段映射层作为新配置入口。

例：操作员默认可编辑，例外“审核结论”为只读；审核员默认只读，例外“审核结论”为可编辑。两个配置都引用同一个真实字段 ID，但在不同阶段/主体下具有不同权限。

## 3. 当前已经有什么，不能误认为什么

| 能力 | 本次源码核对结果（original-evidence） |
| --- | --- |
| 表单流程节点、主体、默认权限、按钮配置 | 已有配置页及保存/发布校验 |
| 作业表单填写节点的版本绑定、字段例外、签名字段绑定 | 已有配置与校验代码，仍需端到端联调 |
| 用户/部门/角色解析、通用引擎候选任务 | 已有实现；不等于表单与作业运行闭环完成 |
| 按当前用户计算最终字段权限并交给表单渲染器 | 尚未冻结正式 DTO/API，不能直接调用本文示例 |
| 表单保存、提交、签署、退回、外层作业同步推进 | 不能宣称完整链路已实现或通过生产验收 |

本次只核对源码和文档，不把配置页存在当作运行能力已完成。

## 4. 给表单开发者的稳定能力要求

### 字段目录

已有作业配置从表单版本 `modelDesignJson` 的 `payload.fields` 读取字段，兼容顶层 `fields`。当前字段对象读取 `id`、`code`、`name`、`type`；这里的 `id` 是权限引用中的 `fieldId`。

```json
{
  "payload": {
    "fields": [
      { "id": "inspectionResult", "code": "RESULT", "name": "检验结果", "type": "text" }
    ]
  }
}
```

上例仅示意现有目录读取形状，`type` 的完整枚举需以表单模块为准。当前兼容代码可能回退到 `code`，前端甚至可生成序号 ID；新对接不要依赖这些回退，应输出稳定、唯一、非空的 `id`。字段改名、排序不能改变 ID；删除后重建是否沿用 ID、复制表单和跨版本 ID 规则需联调冻结。

当前读取器仅取这一级字段数组，不递归读取嵌套明细。子表列 ID、行 ID、容器和嵌套路径的规范尚未闭环，不能承诺现在已支持任意嵌套字段权限。

### 渲染与数据保留

建议先具备以下通用能力，具体参数名待双方对齐：

- 整表只读；按字段 ID 控制编辑/只读；展示已有值。
- 只读字段不能通过输入、粘贴、清空、上传等控件入口改变；只读不等于隐藏。
- 切换权限不清空字段值，提交不因禁用控件而丢失原值。
- 权限加载中或加载失败，不开放编辑和提交；“没有权限结果”和“业务明确不限制主体”必须分开处理。
- 公式、系统字段、历史记录只读等约束不能被流程的 `EDIT` 强行解除；具体优先级需在正式契约中确认。
- 签名字段能显示业务端提供的签署结果；渲染器不自行伪造签署证据或把任意签名图片当作一次有效电子签名。

### 建议的渲染输入（inference，非现有 API）

```ts
type ProposedFormAccess = {
  formTemplateVersionId: string;
  formReadOnly: boolean;
  defaultPermission: 'EDIT' | 'READ_ONLY';
  fieldPermissions: Record<string, 'EDIT' | 'READ_ONLY'>;
};
```

流程侧已提供无副作用的字段权限适配器
[`fieldPermissions.ts`](../../gmp-platform/frontend/src/components/form-access/fieldPermissions.ts)。
表单团队可以复用 `resolveFieldPermissions(fields, rule)` 生成完整字段状态，再将
`states` 映射到渲染器；`toFieldPermissionMap` 可用于需要按 `fieldId` 查询的渲染器。
适配器只识别当前字段目录中的稳定 ID，返回的 `unknownFieldIds` 必须记录为配置诊断，
不能把未知字段当成开放权限。它不负责主体解析、授权或表单控件渲染。

只在权限成功加载后向渲染器提供该对象。建议 `formReadOnly` 优先，否则使用字段权限，缺项继承 `defaultPermission`。业务端可以只传少量覆盖项。该对象不是审批授权凭据，不允许客户端用它绕过服务端校验；端点、响应包、权限修订号和错误码尚未定义。

## 5. 已有配置数据如何交接

以下为当前源码配置形状，供流程开发者定位，不要求表单渲染器直接消费。

作业节点 `data.config` 包含：

```json
{
  "formTemplateVersionId": "369802794968629248",
  "formProcessVersionId": "369802794968629249",
  "fieldPermissions": {
    "approval:approval-1:ROLE:7": { "editableFieldIds": ["inspectionResult"], "readOnlyFieldIds": [] }
  },
  "eventBindings": { "approval-1:event-1": { "fieldId": "reviewSignature" } }
}
```

上述 ID 仅为示例，不是可请求的真实资源。权限 key 当前为 `start:<权限组id>:<主体类型>:<主体id>` 或 `approval:<审批节点id>:<主体类型>:<主体id>`；事件 key 为 `<表单流程节点id>:<事件id>`。它们是当前配置实现细节，不应在表单组件里复制生成逻辑。

`fieldPermissions` 中的默认权限字段存在于存储类型，但当前对接应继承流程主体默认值，不自行引入第二套默认值。更换表单/流程版本时要清理失效字段和主体引用；例外只属于该作业绑定，不回写流程模板。

## 6. 按钮与电子签名

当前节点动作：填报 `SAVE`、`SUBMIT`；审批 `APPROVE`、`RETURN`，显示文案为“审批”而非“同意”。

已确认：默认不添加签署。添加签署时关联按钮动作，签名方式为 `ACCOUNT_PASSWORD`，可选择仅签署、不填字段，也可填充指定签名字段。配置中的 `BEFORE` 表示动作前；`builtin: NONE` 表示不填字段，`FILL_SIGN_FIELD` 表示填字段。

当前代码保存在节点 `buttonEvents`；真实签名字段在作业节点 `eventBindings` 绑定。表单模块不应自行调用按钮动作来推进流程，也不能用个人签名展示接口替代动作级签署证据。

后续运行时需验证：签署取消/失败不得推进动作；同一次签署用于对应字段填充；签署证据、表单保存和任务推进的一致性及重试幂等。签署结果对象、凭证传递和事务边界均待正式联调，不在此虚构接口。

## 7. 已知差距与正式联调清单

以下不是要求朋友现在自行补齐，而是正式对接前的共同检查点：

1. 固定字段目录来源、稳定 ID 和嵌套字段规则，确定签名字段类型白名单。当前配置端和发布校验都只允许 `signature`、`electronicSignature` 或 `sign` 归一化后的签名类型字段作为填充目标；普通文本等非签名字段会被阻断。
2. 固定最终权限 DTO/API、加载失败行为、整表只读与字段规则优先级，区分编辑权限与动作权限。
3. 确认字段例外的运行计算、只读优先合并，以及服务端防止越权改字段的校验与审计。
4. 当前无主体时的绑定 UI 不产生对应主体行；开放范围下如何表达字段例外需补齐，不要假定已有完整入口。
5. 核对签署但不填字段、签署并填字段两条路径。当前 `NONE` 不进入待绑定事件集合，因此只签署不填字段时无需绑定；`FILL_SIGN_FIELD` 才要求字段，并且目标字段除必须存在外还必须是签名类型。后端 `validateFormProcessEventBindings` 在绑定对象缺失时仍需按流程中声明的 `FILL_SIGN_FIELD` 事件阻断未绑定场景。
6. 完成作业实例、表单实例、任务、表单值和签署证据关联；测试退回填报、终止外层、并发审批及重复提交。

最低验收用例：100 个字段只配置 2 个例外；同人命中编辑/只读来源；主体不配置；主体配置后失效；跨版本字段删除；只读值保存不丢失；签署取消；签署不填字段；任一候选处理后其他人不能重复操作。

朋友现在可以先开发字段目录、只读/编辑控制和签名展示，并使用模拟权限对象做组件测试。双方串通并完成上述验收后，更新本文状态、正式接口及请求响应样例。

## 8. 核对来源

`original-evidence`：

- [作业表单绑定、字段读取与编辑](../../gmp-platform/frontend/src/pages/workflow-center/WorkTemplateEditor.tsx)：`templateFields`、`processPermissionSubjects`、`processBuiltinEvents`。
- [表单流程配置](../../gmp-platform/frontend/src/pages/workflow-center/FormProcessEditor.tsx)。
- [按钮及签署配置](../../gmp-platform/frontend/src/components/flow-designer/WorkflowActionConfig.tsx)。
- [作业发布校验](../../gmp-platform/backend/src/main/java/com/zencas/edhr/workflow/controller/WorkTemplateController.java)。
- [通用工作流引擎](../../gmp-platform/backend/src/main/java/com/zencas/edhr/workflow/engine/WorkflowEngine.java)。

`secondary-reference`（用于规则索引，已对照上述源码标记实现边界）：[DEC-0023](../knowledge/decisions/DEC-0023-production-form-process-subject-default-and-binding-exceptions.yaml)、[DEC-0033](../knowledge/decisions/DEC-0033-form-process-optional-subjects-and-open-operation-scope.yaml)、[知识基线](../knowledge/README.md)。
