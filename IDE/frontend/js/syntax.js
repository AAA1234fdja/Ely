/* Ely Cowork · resaltador de sintaxis ligero (colores tipo VS Code Dark+).
 * Sin dependencias: tokeniza por reglas y envuelve en spans con clases tok-*.
 * Las reglas se eligen por FAMILIA de lenguaje (js/languages.js), de modo que
 * los más de 160 modos del selector tienen resaltado coherente.
 * Expone window.Syntax.highlight(code, lang) -> HTML seguro.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* familia → [estiloDeComentario, palabrasClave]
   * estilos: slash // · hash # · dash -- · percent % · semi ; · star * ·
   *          paren (* *) · brace {- -} · html <!-- --> · none */
  const FAMILY = {
    js: ["slash", "const let var function return if else for while do switch case break continue new class extends super this typeof instanceof in of try catch finally throw async await yield import export from default delete void static get set"],
    ts: ["slash", "const let var function return if else for while do switch case break continue new class extends implements interface type enum namespace declare readonly public private protected abstract as keyof infer satisfies this typeof instanceof in of try catch finally throw async await yield import export from default delete void static get set unknown never any string number boolean"],
    python: ["hash", "def return if elif else for while break continue class import from as with try except finally raise lambda pass yield global nonlocal assert del in is not and or None True False async await match case self"],
    ruby: ["hash", "def end return if elsif else unless while until for in do break next class module require require_relative attr_accessor attr_reader attr_writer nil true false self yield begin rescue ensure then case when"],
    php: ["slash", "function echo print return if else elseif foreach for while do switch case break continue class public private protected static new try catch finally throw use namespace null true false array interface trait extends implements fn match"],
    perl: ["hash", "my our local sub return if elsif else unless while until foreach for do last next package use require print printf die warn shift push pop keys values defined ref bless"],
    lua: ["dash", "and break do else elseif end false for function goto if in local nil not or repeat return then true until while self"],
    r: ["hash", "function if else repeat while for in next break TRUE FALSE NULL NA Inf NaN library require return source"],
    julia: ["hash", "function end if elseif else for while begin let local global const struct mutable abstract type module using import export return break continue macro quote do try catch finally true false"],
    matlab: ["percent", "function end if elseif else for while switch case otherwise break continue return global persistent try catch classdef properties methods events otherwise"],
    sas: ["star", "data set run proc quit if then else do end output merge by var label format infile input cards datalines libname filename macro mend let"],
    stata: ["star", "gen generate replace egen drop keep if else foreach forvalues while program define end use save merge append sort by label define"],
    shell: ["hash", "if then else elif fi for while until do done case esac function echo exit return local export set unset shift source alias readonly declare trap eval exec"],
    batch: ["none", "echo off setlocal endlocal set if else exist not errorlevel goto call exit for in do rem pause shift start title"],
    powershell: ["hash", "function param begin process end if elseif else switch while for foreach do until break continue return try catch finally throw filter workflow class enum using module Import-Module Write-Host Write-Output New-Object"],
    c: ["slash", "int long short char float double void unsigned signed struct union enum typedef static const extern volatile register auto if else for while do switch case break continue return sizeof include define ifdef ifndef endif pragma NULL inline restrict"],
    csharp: ["slash", "using namespace class struct interface enum record public private protected internal static readonly const sealed partial abstract override virtual new void var string int bool double decimal object async await task return if else foreach for while switch case break continue try catch finally throw lock get set value this base null true false yield"],
    java: ["slash", "public private protected class interface extends implements static final void int long double float boolean char String new return if else for while do switch case break continue try catch finally throw throws import package this super null true false abstract synchronized volatile transient enum record var yield sealed"],
    kotlin: ["slash", "fun val var class object interface data sealed companion init constructor override open abstract internal private protected public suspend inline reified return if else when for while do break continue try catch finally throw is as in out by lateinit null true false this super import package typealias"],
    scala: ["slash", "def val var class object trait extends with case match if else for while do yield return new import package implicit lazy override final sealed abstract private protected type null true false this super given using enum"],
    groovy: ["slash", "def class interface extends implements trait return if else for while switch case break continue new import package as in null true false this super try catch finally throw static final void pipeline agent stages steps"],
    dart: ["slash", "class abstract extends implements with mixin enum typedef var final const late static void dynamic Future Stream async await sync yield return if else for while do switch case break continue try catch finally rethrow throw new this super null true false import export library part show hide required"],
    swift: ["slash", "func let var class struct enum protocol extension init deinit return if else guard for while repeat switch case break continue defer do try catch throws throw as is in self Self nil true false import public private fileprivate internal open static final override mutating lazy weak unowned some any async await"],
    rust: ["slash", "fn let mut const static if else match loop while for in break continue return struct enum impl trait pub use mod crate self Self as where dyn move ref unsafe async await type box macro_rules"],
    go: ["slash", "func package import var const type struct interface map chan if else for range switch case default break continue return go defer select nil true false fallthrough goto"],
    zig: ["slash", "const var fn pub export extern inline comptime return if else while for switch break continue defer errdefer try catch error union struct enum opaque anytype null true false undefined and or orelse unreachable"],
    nim: ["hash", "proc func var let const type object tuple enum ref ptr return if elif else case of while for break continue yield block when import from include template macro iterator method converter discard nil true false result"],
    d: ["slash", "module import class struct interface union enum alias template mixin return if else foreach for while do switch case break continue new delete null true false this super auto const immutable shared static final override scope inout"],
    v: ["slash", "fn mut pub struct enum interface module import return if else for match break continue defer unsafe go spawn or and in is none true false type const shared lock rlock"],
    crystal: ["hash", "def end class module struct enum lib fun alias include extend require return if elsif else unless while until case when break next yield nil true false self abstract private protected macro"],
    solidity: ["slash", "pragma solidity contract interface library is function modifier event struct enum mapping public private internal external view pure payable returns memory storage calldata constant immutable override virtual require assert revert if else for while do break continue return new delete emit import using constructor fallback receive"],
    haskell: ["brace", "module where import data type newtype class instance deriving do let in case of if then else where default infix infixl infixr foreign qualified as hiding"],
    ml: ["paren", "let in and rec fun function match with type module sig struct end open include val mutable ref if then else begin do done for while to downto of when as assert exception try raise external"],
    elixir: ["hash", "defmodule def defp defmacro defstruct defprotocol defimpl do end if else unless case cond when with fn import alias require use quote unquote try rescue catch after raise throw nil true false and or not in"],
    erlang: ["percent", "module export import define record ifdef endif include_lib behaviour case of if end receive after try catch begin fun when andalso orelse not and or xor div rem bnot"],
    lisp: ["semi", "defn defn- defns def defun defvar defparameter defmacro defclass defmethod defmulti defrecord defprotocol deftype ns in-ns require use import let let* lambda setq setf if cond when unless case loop do dolist dotimes progn return-from quote function funcall apply mapcar cons car cdr list nil t"],
    prolog: ["percent", "true fail cut assert asserta assertz retract findall bagof setof forall once repeat dynamic discontiguous multifile module use_module ensure_loaded"],
    pascal: ["paren", "program unit uses interface implementation begin end procedure function var const type record array of set file class object private public protected published property constructor destructor if then else case while for to downto do repeat until with try except finally raise inherited nil true false and or not div mod xor"],
    fortran: ["none", "program end subroutine function module use implicit none integer real double precision complex character logical if then else elseif endif do enddo while select case where forall allocate deallocate call return print write read open close format parameter data save common equivalence"],
    cobol: ["star", "identification division environment data working-storage section procedure program-id author source-computer object-computer file-control select assign fd pic picture value occurs redefines perform thru until varying move add subtract multiply divide compute if else end-if evaluate when display accept open close read write stop run call using giving"],
    ada: ["dash", "procedure function package body is begin end declare return if then elsif else case when loop while for reverse exit null record array type subtype constant aliased access all new others with use renames pragma task protected entry select accept delay raise exception"],
    abap: ["star", "report data types constants field-symbols tables select from into where endselect if elseif else endif case when endcase loop at endloop do enddo while endwhile form endform function endfunction method endmethod class endclass definition implementation public section private write move call perform append clear refresh free"],
    basic: ["none", "Dim As Integer String Boolean Double Date Sub Function End Class Module Property Get Set Let If Then ElseIf Else Select Case For Each Next While Do Loop Until Return Try Catch Finally Throw Imports Namespace Public Private Protected Shared ReadOnly Const New Me Nothing True False AndAlso OrElse"],
    asm: ["semi", "section segment global extern db dw dd dq resb resw resd resq equ times mov movzx movsx lea push pop add sub mul div imul idiv inc dec neg cmp test and or xor not shl shr sal sar jmp je jne jg jl jge jle jz jnz call ret leave enter nop int syscall xor eax ebx ecx edx rax rbx rcx rdx rsi rdi rsp rbp"],
    llvm: ["semi", "define declare global constant private internal external linkage align ret br switch indirectbr invoke resume unreachable add fadd sub fsub mul fmul udiv sdiv fdiv urem srem frem and or xor shl lshr ashr icmp fcmp phi select call tail load store alloca getelementptr trunc zext sext fptrunc fpext bitcast addrspacecast inttoptr ptrtoint to eq ne ugt uge ult ule sgt sge slt sle label void ptr"],
    shader: ["slash", "attribute uniform varying layout in out inout precision highp mediump lowp void float vec2 vec3 vec4 mat2 mat3 mat4 sampler2D samplerCube int bool struct const return if else for while discard break continue main gl_Position gl_FragColor texture texture2D normalize dot cross reflect refract mix clamp smoothstep"],
    hdl: ["slash", "module endmodule input output inout wire reg logic always assign initial begin end posedge negedge parameter localparam generate endgenerate genvar if else case casex casez endcase for while function endfunction task endtask typedef struct enum interface modport always_ff always_comb always_latch entity architecture signal process component port map begin end is of and or not nand nor xor downto to others"],
    sql: ["dash", "SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX VIEW JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER HAVING LIMIT OFFSET DISTINCT AS AND OR NOT NULL PRIMARY KEY FOREIGN REFERENCES UNIQUE CHECK DEFAULT COUNT SUM AVG MIN MAX CASE WHEN THEN ELSE END BEGIN COMMIT ROLLBACK TRANSACTION WITH UNION ALL EXISTS IN BETWEEN LIKE ILIKE DECLARE PROCEDURE FUNCTION RETURNS TRIGGER"],
    graphql: ["hash", "query mutation subscription fragment on type interface union enum scalar input extend schema implements directive repeatable true false null"],
    protobuf: ["slash", "syntax package import option message enum service rpc returns oneof map repeated optional required reserved extensions extend group stream true false"],
    hcl: ["hash", "resource variable output provider module data locals terraform backend required_providers source version for_each count depends_on lifecycle dynamic content true false null variable default description type string number bool list map set object"],
    rego: ["hash", "package import default as with else not some contains if every in true false null"],
    nginx: ["hash", "server location upstream http events worker_processes listen server_name root index proxy_pass proxy_set_header return rewrite if try_files include error_page access_log error_log ssl_certificate add_header set map"],
    dockerfile: ["hash", "FROM RUN CMD LABEL MAINTAINER EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD STOPSIGNAL HEALTHCHECK SHELL AS"],
    make: ["hash", "include define enddef ifdef ifndef else endif override export unexport vpath .PHONY .SUFFIXES .DEFAULT .PRECIOUS .INTERMEDIATE .SECONDARY .DELETE_ON_ERROR all clean install test build"],
    cmake: ["hash", "project cmake_minimum_required add_executable add_library add_subdirectory target_link_libraries target_include_directories target_compile_options set unset list string if elseif else endif foreach endforeach while endwhile function endfunction macro endmacro message option find_package include install configure_file add_definitions"],
    latex: ["percent", "documentclass usepackage begin end section subsection subsubsection chapter paragraph label ref cite item textbf textit emph newcommand renewcommand def includegraphics caption table figure equation align itemize enumerate title author maketitle tableofcontents bibliography"],
    bibtex: ["percent", "article book inproceedings incollection phdthesis mastersthesis techreport misc author title journal year volume number pages publisher address editor booktitle series doi url note"],
    yaml: ["hash", "true false null yes no on off"],
    toml: ["hash", "true false"],
    ini: ["hash", "true false yes no on off"],
    json: ["none", "true false null"],
    template: ["html", "if else endif for endfor block endblock extends include set macro endmacro with endwith raw endraw filter endfilter each endeach unless endunless define end"],
    vue: ["html", "template script style setup export default props data computed methods watch mounted created ref reactive defineProps defineEmits"],
    svelte: ["html", "script style export let reactive onMount onDestroy beforeUpdate afterUpdate createEventDispatcher"],
    astro: ["html", "Astro props params request response redirect slots frontmatter export const"],
    mermaid: ["percent", "graph flowchart sequenceDiagram classDiagram stateDiagram erDiagram gantt pie journey gitGraph subgraph end participant actor note over loop alt else opt par and rect activate deactivate"],
    plantuml: ["none", "startuml enduml participant actor boundary control entity database collections queue activate deactivate note left right over end ref alt else opt loop group par break critical title header footer newpage autonumber class interface abstract enum package namespace"],
    dot: ["slash", "digraph graph subgraph node edge strict rankdir label shape color style fontname fontsize penwidth arrowhead arrowtail cluster rank same min max"],
    gherkin: ["hash", "Feature Background Scenario Outline Examples Given When Then And But Rule Scenario Template"],
    robot: ["hash", "Settings Variables Test Cases Keywords Tasks Library Resource Suite Setup Suite Teardown Test Setup Test Teardown Documentation Tags Arguments Return Timeout Template"],
    rst: ["none", "note warning important tip caution danger attention error hint seealso todo versionadded versionchanged deprecated code-block image figure table contents"],
    asciidoc: ["none", "NOTE TIP IMPORTANT WARNING CAUTION include ifdef ifndef endif image link table source code"],
    org: ["hash", "TODO DONE STARTED CANCELLED WAITING DEADLINE SCHEDULED PROPERTIES END SRC BEGIN_EXAMPLE RESULTS CAPTION NAME HEADER"],
    diff: ["none", ""],
    http: ["hash", "GET POST PUT PATCH DELETE HEAD OPTIONS TRACE CONNECT HTTP Authorization Content-Type Accept"],
    csv: ["none", ""],
    log: ["none", "ERROR WARN WARNING INFO DEBUG TRACE FATAL CRITICAL"],
    text: ["none", ""]
  };

  const LINE_COMMENT = {
    slash: /\/\/[^\n]*/y, hash: /#[^\n]*/y, dash: /--[^\n]*/y,
    percent: /%[^\n]*/y, semi: /;[^\n]*/y, star: /^\s*[*>][^\n]*/my,
    none: null, html: null, paren: null, brace: null
  };
  const BLOCK_COMMENT = {
    paren: /\(\*[\s\S]*?\*\)/y, brace: /\{-[\s\S]*?-\}/y,
    html: /<!--[\s\S]*?-->/y, slash: /\/\*[\s\S]*?\*\//y,
    dash: null, hash: null, percent: null, semi: null, star: null, none: null
  };
  const HASH_BLOCK = ["python", "ruby", "elixir", "crystal", "powershell"];

  function familyOf(lang) {
    const id = String(lang || "").toLowerCase();
    if (window.Languages) {
      const fam = window.Languages.family(id);
      if (FAMILY[fam]) return fam;
    }
    return FAMILY[id] ? id : "js";
  }

  function rulesFor(lang) {
    const l = String(lang || "").toLowerCase();
    const fam = familyOf(l);
    const rules = [];

    /* --- familias con gramática propia --- */
    if (fam === "markup" || fam === "vue" || fam === "svelte" || fam === "astro") {
      rules.push(["com", /<!--[\s\S]*?-->/y]);
      rules.push(["tag", /<\/?[A-Za-z][\w:.-]*/y]);
      rules.push(["str", /"[^"]*"|'[^']*'/y]);
      rules.push(["attr", /[A-Za-z_:@][\w:.-]*(?==)/y]);
      rules.push(["punct", /[<>/=]/y]);
      if (fam !== "markup") {
        const kws = (FAMILY[fam][1] || "").split(" ").filter(Boolean);
        rules.push(["kw", new RegExp("\\b(?:" + kws.join("|") + ")\\b", "y")]);
      }
      return rules;
    }
    if (fam === "css") {
      rules.push(["com", /\/\*[\s\S]*?\*\//y]);
      rules.push(["com", /\/\/[^\n]*/y]);
      rules.push(["str", /"[^"]*"|'[^']*'/y]);
      rules.push(["num", /#[0-9a-fA-F]{3,8}\b|\b\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/y]);
      rules.push(["kw", /@[A-Za-z-]+|\$[A-Za-z-]+|--[A-Za-z-]+/y]);
      rules.push(["attr", /[A-Za-z-]+(?=\s*:)/y]);
      rules.push(["tag", /[.#&][A-Za-z][\w-]*/y]);
      return rules;
    }
    if (fam === "json") {
      rules.push(["com", /\/\/[^\n]*/y]);
      rules.push(["attr", /"[^"]*"(?=\s*:)/y]);
      rules.push(["str", /"[^"]*"/y]);
      rules.push(["num", /-?\b\d+(\.\d+)?\b/y]);
      rules.push(["bool", /\b(true|false|null)\b/y]);
      return rules;
    }
    if (fam === "markdown") {
      rules.push(["kw", /^#{1,6}[^\n]*/my]);
      rules.push(["str", /```[\s\S]*?```|`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*/y]);
      rules.push(["com", /^>[^\n]*/my]);
      rules.push(["fn", /\[[^\]]*\]\([^)]*\)/y]);
      rules.push(["num", /^\s*[-*+]\s|^\s*\d+\.\s/my]);
      return rules;
    }
    if (fam === "yaml") {
      rules.push(["com", /#[^\n]*/y]);
      rules.push(["attr", /^\s*[\w.-]+(?=\s*:)/my]);
      rules.push(["str", /"[^"]*"|'[^']*'/y]);
      rules.push(["kw", /^\s*-\s(?=\S)/my]);
      rules.push(["bool", /\b(true|false|null|yes|no)\b/y]);
      rules.push(["num", /\b\d+(\.\d+)?\b/y]);
      return rules;
    }
    if (fam === "ini" || fam === "toml") {
      rules.push(["com", /^[#;][^\n]*/my]);
      rules.push(["kw", /^\s*\[[^\]]*\]/my]);
      rules.push(["attr", /^\s*[\w.-]+(?=\s*=)/my]);
      rules.push(["str", /"[^"]*"|'[^']*'/y]);
      rules.push(["bool", /\b(true|false|yes|no|on|off)\b/y]);
      rules.push(["num", /\b\d+(\.\d+)?\b/y]);
      return rules;
    }
    if (fam === "diff") {
      rules.push(["kw", /^\+\+\+[^\n]*|^---[^\n]*/my]);
      rules.push(["str", /^\+[^\n]*/my]);
      rules.push(["com", /^-[^\n]*/my]);
      rules.push(["fn", /^@@[^\n]*/my]);
      rules.push(["attr", /^diff [^\n]*/my]);
      return rules;
    }
    if (fam === "csv") {
      rules.push(["str", /"[^"]*"/y]);
      rules.push(["num", /-?\b\d+(\.\d+)?\b/y]);
      rules.push(["punct", /[,;\t]/y]);
      return rules;
    }
    if (fam === "latex" || fam === "bibtex") {
      rules.push(["com", /%[^\n]*/y]);
      rules.push(["kw", /\\[A-Za-z]+/y]);
      rules.push(["attr", /@[A-Za-z]+/y]);
      rules.push(["str", /\{[^{}]*\}/y]);
      rules.push(["num", /\b\d+(\.\d+)?\b/y]);
      return rules;
    }
    if (fam === "http") {
      rules.push(["com", /^#[^\n]*/my]);
      rules.push(["kw", /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/my]);
      rules.push(["attr", /^[A-Za-z-]+(?=:)/my]);
      rules.push(["str", /"[^"]*"/y]);
      rules.push(["fn", /https?:\/\/[^\s]+/y]);
      return rules;
    }
    if (fam === "log") {
      rules.push(["com", /\b(ERROR|FATAL|CRITICAL)\b/y]);
      rules.push(["kw", /\b(WARN|WARNING)\b/y]);
      rules.push(["fn", /\b(INFO|DEBUG|TRACE)\b/y]);
      rules.push(["num", /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?\b|\b\d+\b/y]);
      return rules;
    }

    /* --- lenguajes de programación genéricos --- */
    const spec = FAMILY[fam] || FAMILY.js;
    const style = spec[0];
    const block = BLOCK_COMMENT[style];
    if (block) rules.push(["com", block]);
    if (HASH_BLOCK.includes(fam)) rules.push(["com", /"""[\s\S]*?"""|'''[\s\S]*?'''/y]);
    const line = LINE_COMMENT[style];
    if (line) rules.push(["com", line]);
    if (fam === "cobol" || fam === "sas" || fam === "abap") rules.push(["com", /^\s*\*[^\n]*/my]);
    rules.push(["str", /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y]);
    rules.push(["num", /\b(0x[0-9a-fA-F]+|0b[01]+|\d+(\.\d+)?([eE][+-]?\d+)?)\b/y]);
    rules.push(["bool", /\b(true|false|True|False|None|NULL|null|nil|TRUE|FALSE)\b/y]);
    const kws = String(spec[1] || "").split(/\s+/).filter(Boolean)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (kws.length) {
      const ci = ["sql", "cobol", "fortran", "basic", "ada", "abap", "sas", "stata", "bat", "batch"].includes(fam);
      rules.push(["kw", new RegExp("\\b(?:" + kws.join("|") + ")\\b", ci ? "iy" : "y")]);
    }
    rules.push(["fn", /[A-Za-z_]\w*(?=\s*\()/y]);
    rules.push(["attr", /[@#][A-Za-z_]\w*|\[[A-Za-z_]\w*\]/y]);
    return rules;
  }

  function highlight(code, lang) {
    const rules = rulesFor(lang);
    let out = "";
    let i = 0;
    const n = code.length;
    while (i < n) {
      let matched = false;
      for (const [cls, re] of rules) {
        re.lastIndex = i;
        const m = re.exec(code);
        if (m && m.index === i && m[0].length) {
          out += '<span class="tok-' + cls + '">' + esc(m[0]) + "</span>";
          i += m[0].length;
          matched = true;
          break;
        }
      }
      if (!matched) { out += esc(code[i]); i += 1; }
    }
    return out;
  }

  /* Palabras clave de la familia: las reutiliza el autocompletado. */
  function keywords(lang) {
    const spec = FAMILY[familyOf(lang)] || FAMILY.js;
    return String(spec[1] || "").split(/\s+/).filter(Boolean);
  }

  window.Syntax = { highlight, families: Object.keys(FAMILY), familyOf, keywords };
})();
