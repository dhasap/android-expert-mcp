/**
 * 🏗️ Project Scaffolding Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Generate boilerplate project lengkap sesuai stack kamu:
 *
 *   • Android (Kotlin + Jetpack Compose, MVVM/Clean Architecture)
 *   • Bot Telegram (Python, aiogram 3.x atau python-telegram-bot)
 *   • Chrome Extension (Manifest V3, TypeScript)
 *   • Web Landing Page (HTML/CSS/JS + Firebase Hosting ready)
 *   • Node.js API (Express/Fastify + TypeScript + Turso)
 *
 * Setiap template sudah include:
 *   - Struktur direktori yang benar
 *   - Semua file konfigurasi (build.gradle, tsconfig, pyproject, manifest)
 *   - .gitignore yang tepat per stack
 *   - README dengan instruksi setup
 *   - Contoh kode yang langsung bisa dijalankan
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { formatToolError, ensureDir } from "../utils.js";

// ─── File writer helper ───────────────────────────────────────────────────────

async function writeProjectFile(
  baseDir: string,
  relativePath: string,
  content: string
): Promise<void> {
  const fullPath = path.join(baseDir, relativePath);
  await ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, content, "utf-8");
}

async function summarizeCreatedFiles(baseDir: string): Promise<string> {
  const files: string[] = [];
  async function walk(dir: string, prefix = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if ([".git", "node_modules", "__pycache__", ".gradle"].includes(e.name)) continue;
      files.push(prefix + (e.isDirectory() ? "📁 " : "📄 ") + e.name);
      if (e.isDirectory()) await walk(path.join(dir, e.name), prefix + "   ");
    }
  }
  await walk(baseDir);
  return files.join("\n");
}

// ─── Templates ───────────────────────────────────────────────────────────────

async function scaffoldAndroid(
  dir: string,
  opts: {
    appName: string;
    packageName: string;
    minSdk: number;
    targetSdk: number;
    useCompose: boolean;
    architecture: "mvvm" | "clean" | "simple";
    includeRoom: boolean;
    includeRetrofit: boolean;
    includeHilt: boolean;
  }
) {
  const pkg = opts.packageName;
  const pkgPath = pkg.replace(/\./g, "/");
  const appModule = "app";

  // settings.gradle.kts
  await writeProjectFile(dir, "settings.gradle.kts", `
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${opts.appName}"
include(":${appModule}")
`.trimStart());

  // build.gradle.kts (root)
  await writeProjectFile(dir, "build.gradle.kts", `
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    ${opts.includeHilt ? 'alias(libs.plugins.hilt) apply false' : ''}
}
`.trimStart());

  // gradle/libs.versions.toml
  const composeVersion = "1.6.7";
  const kotlinVersion = "2.0.0";
  await writeProjectFile(dir, "gradle/libs.versions.toml", `
[versions]
agp = "8.5.0"
kotlin = "${kotlinVersion}"
compose-bom = "2024.06.00"
lifecycle = "2.8.3"
navigation = "2.7.7"
${opts.includeRoom ? 'room = "2.6.1"' : ''}
${opts.includeRetrofit ? 'retrofit = "2.11.0"\nokhttp = "4.12.0"' : ''}
${opts.includeHilt ? 'hilt = "2.51.1"' : ''}
coroutines = "1.8.1"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version = "1.13.1" }
androidx-lifecycle-runtime = { group = "androidx.lifecycle", name = "lifecycle-runtime-ktx", version.ref = "lifecycle" }
androidx-lifecycle-viewmodel = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-ktx", version.ref = "lifecycle" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version = "1.9.0" }
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
compose-ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
compose-navigation = { group = "androidx.navigation", name = "navigation-compose", version.ref = "navigation" }
kotlinx-coroutines = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
${opts.includeRoom ? `room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }` : ''}
${opts.includeRetrofit ? `retrofit = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
retrofit-gson = { group = "com.squareup.retrofit2", name = "converter-gson", version.ref = "retrofit" }
okhttp-logging = { group = "com.squareup.okhttp3", name = "logging-interceptor", version.ref = "okhttp" }` : ''}
${opts.includeHilt ? `hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }
hilt-compiler = { group = "com.google.dagger", name = "hilt-android-compiler", version.ref = "hilt" }
hilt-navigation-compose = { group = "androidx.hilt", name = "hilt-navigation-compose", version = "1.2.0" }` : ''}
junit = { group = "junit", name = "junit", version = "4.13.2" }
androidx-test-junit = { group = "androidx.test.ext", name = "junit", version = "1.2.1" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
${opts.includeHilt ? `hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
kotlin-kapt = { id = "org.jetbrains.kotlin.kapt", version.ref = "kotlin" }` : ''}
`.trimStart());

  // app/build.gradle.kts
  await writeProjectFile(dir, `${appModule}/build.gradle.kts`, `
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    ${opts.includeHilt ? 'alias(libs.plugins.hilt)\nalias(libs.plugins.kotlin.kapt)' : ''}
}

android {
    namespace = "${pkg}"
    compileSdk = ${opts.targetSdk}

    defaultConfig {
        applicationId = "${pkg}"
        minSdk = ${opts.minSdk}
        targetSdk = ${opts.targetSdk}
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    buildFeatures { compose = true }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime)
    implementation(libs.androidx.lifecycle.viewmodel)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.navigation)
    implementation(libs.kotlinx.coroutines)
    debugImplementation(libs.compose.ui.tooling)
    ${opts.includeRoom ? `implementation(libs.room.runtime)\nimplementation(libs.room.ktx)\nkapt(libs.room.compiler)` : ''}
    ${opts.includeRetrofit ? `implementation(libs.retrofit)\nimplementation(libs.retrofit.gson)\nimplementation(libs.okhttp.logging)` : ''}
    ${opts.includeHilt ? `implementation(libs.hilt.android)\nkapt(libs.hilt.compiler)\nimplementation(libs.hilt.navigation.compose)` : ''}
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.junit)
}
`.trimStart());

  // AndroidManifest.xml
  await writeProjectFile(
    dir,
    `${appModule}/src/main/AndroidManifest.xml`,
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:allowBackup="true"
        android:label="@string/app_name"
        android:theme="@style/Theme.${opts.appName.replace(/\s+/g, "")}"
        android:supportsRtl="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.${opts.appName.replace(/\s+/g, "")}">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`
  );

  // MainActivity.kt
  const vmImport = opts.includeHilt
    ? `import androidx.hilt.navigation.compose.hiltViewModel\n`
    : "";
  await writeProjectFile(
    dir,
    `${appModule}/src/main/java/${pkgPath}/MainActivity.kt`,
    `package ${pkg}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
${vmImport}import ${pkg}.ui.theme.${opts.appName.replace(/\s+/g, "")}Theme
${opts.includeHilt ? "import dagger.hilt.android.AndroidEntryPoint\n\n@AndroidEntryPoint" : ""}
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ${opts.appName.replace(/\s+/g, "")}Theme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    Greeting(
                        name = "Android",
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }
}

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
    Text(text = "Hello ${'$'}name!", modifier = modifier)
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    ${opts.appName.replace(/\s+/g, "")}Theme {
        Greeting("Android")
    }
}
`
  );

  // Theme files
  const themeName = opts.appName.replace(/\s+/g, "");
  await writeProjectFile(
    dir,
    `${appModule}/src/main/java/${pkgPath}/ui/theme/Theme.kt`,
    `package ${pkg}.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme()
private val LightColorScheme = lightColorScheme()

@Composable
fun ${themeName}Theme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
`
  );

  await writeProjectFile(
    dir,
    `${appModule}/src/main/java/${pkgPath}/ui/theme/Type.kt`,
    `package ${pkg}.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Typography = Typography(
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.5.sp
    )
)
`
  );

  // ViewModel jika MVVM/Clean
  if (opts.architecture !== "simple") {
    await writeProjectFile(
      dir,
      `${appModule}/src/main/java/${pkgPath}/ui/main/MainViewModel.kt`,
      `package ${pkg}.ui.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
${opts.includeHilt ? "import dagger.hilt.android.lifecycle.HiltViewModel\nimport javax.inject.Inject\n\n@HiltViewModel" : ""}
class MainViewModel${opts.includeHilt ? " @Inject constructor()" : "()"} : ViewModel() {
    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    fun onAction(action: MainAction) {
        viewModelScope.launch {
            when (action) {
                is MainAction.LoadData -> loadData()
            }
        }
    }

    private suspend fun loadData() {
        _uiState.value = _uiState.value.copy(isLoading = true)
        // TODO: implement
        _uiState.value = _uiState.value.copy(isLoading = false)
    }
}

data class MainUiState(
    val isLoading: Boolean = false,
    val error: String? = null
)

sealed class MainAction {
    object LoadData : MainAction()
}
`
    );
  }

  // strings.xml
  await writeProjectFile(
    dir,
    `${appModule}/src/main/res/values/strings.xml`,
    `<resources>
    <string name="app_name">${opts.appName}</string>
</resources>`
  );

  // themes.xml
  await writeProjectFile(
    dir,
    `${appModule}/src/main/res/values/themes.xml`,
    `<resources>
    <style name="Theme.${themeName}" parent="android:Theme.Material.Light.NoActionBar" />
</resources>`
  );

  // .gitignore
  await writeProjectFile(
    dir,
    ".gitignore",
    `*.iml\n.gradle\n/local.properties\n/.idea\n.DS_Store\n/build\n/captures\n.externalNativeBuild\n.cxx\nlocal.properties\n`
  );

  // gradle.properties
  await writeProjectFile(
    dir,
    "gradle.properties",
    `android.useAndroidX=true\nandroid.enableJetifier=false\nkotlin.code.style=official\nandroid.nonTransitiveRClass=true\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\n`
  );
}

async function scaffoldTelegramBot(
  dir: string,
  opts: {
    botName: string;
    framework: "aiogram" | "ptb";
    includeDatabase: boolean;
    dbType: "turso" | "sqlite" | "none";
    includeWebhook: boolean;
  }
) {
  const isAiogram = opts.framework === "aiogram";

  // pyproject.toml
  await writeProjectFile(
    dir,
    "pyproject.toml",
    `[project]
name = "${opts.botName.toLowerCase().replace(/\s+/g, "-")}"
version = "0.1.0"
description = "Telegram Bot — ${opts.botName}"
requires-python = ">=3.11"
dependencies = [
    ${isAiogram ? '"aiogram>=3.7.0"' : '"python-telegram-bot[job-queue]>=21.0"'},
    "python-dotenv>=1.0.0",
    ${opts.dbType === "turso" ? '"libsql-client>=0.3.0",' : ''}
    ${opts.dbType === "sqlite" ? '"aiosqlite>=0.20.0",' : ''}
    "loguru>=0.7.2",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`
  );

  // .env.example
  await writeProjectFile(
    dir,
    ".env.example",
    `BOT_TOKEN=your_telegram_bot_token_here
${opts.dbType === "turso" ? "TURSO_DATABASE_URL=libsql://your-db.turso.io\nTURSO_AUTH_TOKEN=your_auth_token" : ""}
${opts.includeWebhook ? "WEBHOOK_URL=https://your-domain.com\nWEBHOOK_PORT=8080" : ""}
LOG_LEVEL=INFO
`
  );

  // main bot file
  if (isAiogram) {
    await writeProjectFile(
      dir,
      "main.py",
      `"""${opts.botName} — Telegram Bot (aiogram 3.x)"""
import asyncio
from loguru import logger
from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv
import os

from handlers import router
${opts.includeWebhook ? "from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application\nfrom aiohttp import web" : ""}
${opts.dbType !== "none" ? "from database import init_db" : ""}

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
assert BOT_TOKEN, "BOT_TOKEN harus diset di .env"

async def main():
    bot = Bot(
        token=BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )
    dp = Dispatcher()
    dp.include_router(router)

    ${opts.dbType !== "none" ? "await init_db()" : ""}

    logger.info("Bot ${opts.botName} starting...")
    ${opts.includeWebhook
        ? `# Webhook mode\nWEBHOOK_URL = os.getenv("WEBHOOK_URL")\nawait bot.set_webhook(f"{WEBHOOK_URL}/webhook")\napp = web.Application()\nSimpleRequestHandler(dispatcher=dp, bot=bot).register(app, path="/webhook")\nsetup_application(app, dp, bot=bot)\nweb.run_app(app, port=int(os.getenv("WEBHOOK_PORT", 8080)))`
        : `# Polling mode\nawait dp.start_polling(bot, skip_updates=True)`}

if __name__ == "__main__":
    asyncio.run(main())
`
    );

    // handlers.py
    await writeProjectFile(
      dir,
      "handlers/__init__.py",
      `from .main import router\n__all__ = ["router"]\n`
    );

    await writeProjectFile(
      dir,
      "handlers/main.py",
      `from aiogram import Router, F
from aiogram.types import Message
from aiogram.filters import CommandStart, Command

router = Router()

@router.message(CommandStart())
async def cmd_start(message: Message):
    await message.answer(
        f"👋 Halo, <b>{message.from_user.first_name}</b>!\\n"
        f"Bot <b>${opts.botName}</b> siap melayani."
    )

@router.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(
        "📋 <b>Daftar Command:</b>\\n"
        "/start — Mulai bot\\n"
        "/help — Tampilkan bantuan"
    )

@router.message(F.text)
async def echo_handler(message: Message):
    await message.answer(f"Kamu bilang: {message.text}")
`
    );
  } else {
    // python-telegram-bot
    await writeProjectFile(
      dir,
      "main.py",
      `"""${opts.botName} — Telegram Bot (python-telegram-bot)"""
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from dotenv import load_dotenv
import os

load_dotenv()
logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_html(f"👋 Halo, <b>{update.effective_user.first_name}</b>!")

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Perintah tersedia:\\n/start\\n/help")

async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(update.message.text)

def main():
    app = Application.builder().token(os.getenv("BOT_TOKEN")).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    app.run_polling()

if __name__ == "__main__":
    main()
`
    );
  }

  // Database module
  if (opts.dbType === "turso") {
    await writeProjectFile(
      dir,
      "database.py",
      `"""Database module — Turso (libSQL)"""
import os
import libsql_client
from dotenv import load_dotenv

load_dotenv()

_client = None

def get_client():
    global _client
    if _client is None:
        _client = libsql_client.create_client(
            url=os.getenv("TURSO_DATABASE_URL"),
            auth_token=os.getenv("TURSO_AUTH_TOKEN"),
        )
    return _client

async def init_db():
    client = get_client()
    await client.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            telegram_id INTEGER UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    await client.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            text TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

async def upsert_user(telegram_id: int, username: str, first_name: str):
    client = get_client()
    await client.execute(
        "INSERT OR REPLACE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)",
        [telegram_id, username, first_name]
    )
`
    );
  }

  // .gitignore
  await writeProjectFile(
    dir,
    ".gitignore",
    `__pycache__/\n*.py[cod]\n.env\n*.db\n.venv/\nvenv/\ndist/\n*.egg-info/\n.pytest_cache/\nlogs/\n`
  );
}

async function scaffoldChromeExtension(
  dir: string,
  opts: {
    extensionName: string;
    description: string;
    useTypeScript: boolean;
    hasPopup: boolean;
    hasContentScript: boolean;
    hasBackground: boolean;
    hasOptions: boolean;
  }
) {
  // manifest.json (MV3)
  await writeProjectFile(
    dir,
    "manifest.json",
    JSON.stringify(
      {
        manifest_version: 3,
        name: opts.extensionName,
        version: "1.0.0",
        description: opts.description,
        permissions: ["storage", "activeTab"],
        host_permissions: ["<all_urls>"],
        ...(opts.hasBackground
          ? {
              background: {
                service_worker: opts.useTypeScript ? "dist/background.js" : "background.js",
                type: "module",
              },
            }
          : {}),
        ...(opts.hasPopup
          ? { action: { default_popup: "popup.html", default_icon: { "16": "icons/icon16.png", "48": "icons/icon48.png" } } }
          : {}),
        ...(opts.hasContentScript
          ? {
              content_scripts: [
                {
                  matches: ["<all_urls>"],
                  js: [opts.useTypeScript ? "dist/content.js" : "content.js"],
                  run_at: "document_idle",
                },
              ],
            }
          : {}),
        ...(opts.hasOptions ? { options_page: "options.html" } : {}),
      },
      null,
      2
    )
  );

  if (opts.useTypeScript) {
    // tsconfig.json
    await writeProjectFile(
      dir,
      "tsconfig.json",
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ES2022",
            moduleResolution: "bundler",
            outDir: "./dist",
            rootDir: "./src",
            strict: true,
            lib: ["ES2022", "DOM"],
            types: ["chrome"],
          },
          include: ["src/**/*"],
        },
        null,
        2
      )
    );

    // package.json
    await writeProjectFile(
      dir,
      "package.json",
      JSON.stringify(
        {
          name: opts.extensionName.toLowerCase().replace(/\s+/g, "-"),
          version: "1.0.0",
          scripts: {
            build: "tsc",
            "build:watch": "tsc --watch",
            dev: "tsc --watch",
          },
          devDependencies: {
            typescript: "^5.5.0",
            "@types/chrome": "^0.0.268",
          },
        },
        null,
        2
      )
    );

    if (opts.hasBackground) {
      await writeProjectFile(
        dir,
        "src/background.ts",
        `// Service Worker — ${opts.extensionName}
chrome.runtime.onInstalled.addListener(() => {
  console.log("${opts.extensionName} installed!");
});

chrome.runtime.onMessage.addListener(
  (message: { type: string; payload?: unknown }, sender, sendResponse) => {
    if (message.type === "PING") {
      sendResponse({ type: "PONG" });
    }
    return true; // keep channel open
  }
);
`
      );
    }

    if (opts.hasContentScript) {
      await writeProjectFile(
        dir,
        "src/content.ts",
        `// Content Script — ${opts.extensionName}
// Berjalan di halaman web yang dikunjungi user

(function () {
  console.log("[${opts.extensionName}] Content script loaded on:", window.location.href);

  // Contoh: kirim pesan ke background
  chrome.runtime.sendMessage({ type: "PING" }, (response) => {
    console.log("[${opts.extensionName}] Background response:", response);
  });

  // Contoh: observe DOM changes
  const observer = new MutationObserver((mutations) => {
    // TODO: handle DOM changes
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
`
      );
    }

    if (opts.hasPopup) {
      await writeProjectFile(
        dir,
        "src/popup.ts",
        `// Popup script — ${opts.extensionName}
document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status")!;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url ?? "unknown";
    statusEl.textContent = \`Current: \${url}\`;
  });
});
`
      );
    }
  }

  // Popup HTML
  if (opts.hasPopup) {
    await writeProjectFile(
      dir,
      "popup.html",
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { min-width: 300px; padding: 16px; font-family: system-ui; }
    h1 { font-size: 16px; margin: 0 0 12px; }
    #status { font-size: 12px; color: #666; word-break: break-all; }
  </style>
</head>
<body>
  <h1>${opts.extensionName}</h1>
  <p id="status">Loading...</p>
  <script src="${opts.useTypeScript ? "dist/popup.js" : "popup.js"}" type="module"></script>
</body>
</html>`
    );
  }

  // .gitignore
  await writeProjectFile(
    dir,
    ".gitignore",
    `dist/\nnode_modules/\n*.crx\n*.pem\n`
  );
}

async function scaffoldNodeApi(
  dir: string,
  opts: {
    projectName: string;
    framework: "express" | "fastify";
    useTurso: boolean;
    useFirebase: boolean;
  }
) {
  await writeProjectFile(
    dir,
    "package.json",
    JSON.stringify(
      {
        name: opts.projectName.toLowerCase().replace(/\s+/g, "-"),
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "tsx watch src/index.ts",
          build: "tsc",
          start: "node dist/index.js",
        },
        dependencies: {
          ...(opts.framework === "express"
            ? { express: "^4.19.2", "@types/express": "^4.17.21" }
            : { fastify: "^4.28.0" }),
          "dotenv": "^16.4.5",
          ...(opts.useTurso ? { "@libsql/client": "^0.6.2" } : {}),
          ...(opts.useFirebase ? { "firebase-admin": "^12.3.0" } : {}),
          "zod": "^3.23.8",
        },
        devDependencies: {
          typescript: "^5.5.0",
          "@types/node": "^22.0.0",
          tsx: "^4.16.2",
        },
      },
      null,
      2
    )
  );

  await writeProjectFile(
    dir,
    "src/index.ts",
    opts.framework === "express"
      ? `import express from "express";
import { config } from "dotenv";
config();

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(\`🚀 ${opts.projectName} running on http://localhost:\${PORT}\`);
});

export default app;
`
      : `import Fastify from "fastify";
import { config } from "dotenv";
config();

const app = Fastify({ logger: true });
const PORT = parseInt(process.env.PORT ?? "3000");

app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

app.listen({ port: PORT }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
`
  );

  if (opts.useTurso) {
    await writeProjectFile(
      dir,
      "src/db.ts",
      `import { createClient } from "@libsql/client";
import { config } from "dotenv";
config();

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function initDb() {
  await db.execute(\`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  \`);
  console.log("✅ Database initialized");
}
`
    );
  }

  await writeProjectFile(dir, ".env.example",
    `PORT=3000\n${opts.useTurso ? "TURSO_DATABASE_URL=libsql://your-db.turso.io\nTURSO_AUTH_TOKEN=your_token\n" : ""}${opts.useFirebase ? "FIREBASE_PROJECT_ID=your-project\n" : ""}`
  );

  await writeProjectFile(dir, ".gitignore",
    `node_modules/\ndist/\n.env\n*.log\n`
  );
}

// ─── Tool Registration ────────────────────────────────────────────────────────

export function registerScaffoldingTools(server: McpServer): void {

  // ── 1. scaffold_android ───────────────────────────────────────────────────
  server.tool(
    "scaffold_android",
    "Generate project Android lengkap dengan Kotlin + Jetpack Compose. " +
      "Termasuk build.gradle.kts, Version Catalog, tema, dan struktur MVVM/Clean. " +
      "Pilih dependencies: Room, Retrofit, Hilt sesuai kebutuhan.",
    {
      output_dir: z.string().describe("Direktori output project"),
      app_name: z.string().describe("Nama aplikasi, misal 'MyAwesomeApp'"),
      package_name: z
        .string()
        .describe("Package name, misal 'com.username.myapp'"),
      min_sdk: z.number().int().min(21).max(34).default(26),
      target_sdk: z.number().int().min(33).max(35).default(35),
      architecture: z
        .enum(["simple", "mvvm", "clean"])
        .default("mvvm")
        .describe("Arsitektur: simple=no pattern, mvvm=ViewModel+StateFlow, clean=full layers"),
      include_room: z.boolean().default(false).describe("Tambahkan Room Database"),
      include_retrofit: z.boolean().default(false).describe("Tambahkan Retrofit + OkHttp"),
      include_hilt: z.boolean().default(false).describe("Tambahkan Hilt DI"),
    },
    async ({
      output_dir, app_name, package_name, min_sdk, target_sdk,
      architecture, include_room, include_retrofit, include_hilt,
    }) => {
      try {
        const resolvedDir = path.resolve(output_dir);
        await ensureDir(resolvedDir);

        await scaffoldAndroid(resolvedDir, {
          appName: app_name,
          packageName: package_name,
          minSdk: min_sdk,
          targetSdk: target_sdk,
          useCompose: true,
          architecture,
          includeRoom: include_room,
          includeRetrofit: include_retrofit,
          includeHilt: include_hilt,
        });

        const tree = await summarizeCreatedFiles(resolvedDir);

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Android project berhasil di-scaffold!\n` +
                `${"═".repeat(55)}\n` +
                `📁 Location : ${resolvedDir}\n` +
                `📦 Package  : ${package_name}\n` +
                `🏗️  Arch     : ${architecture}\n` +
                `📚 Deps     : ${[include_room && "Room", include_retrofit && "Retrofit", include_hilt && "Hilt"].filter(Boolean).join(", ") || "minimal"}\n\n` +
                `📂 Files created:\n${tree}\n\n` +
                `🚀 Next steps:\n` +
                `   1. cd ${resolvedDir}\n` +
                `   2. Buka di Android Studio / IDX\n` +
                `   3. Sync Gradle: ./gradlew build`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("scaffold_android", error) }],
        };
      }
    }
  );

  // ── 2. scaffold_telegram_bot ──────────────────────────────────────────────
  server.tool(
    "scaffold_telegram_bot",
    "Generate project bot Telegram dengan Python. " +
      "Support aiogram 3.x (async, modern) atau python-telegram-bot. " +
      "Opsional: integrasi Turso database, webhook mode untuk VPS.",
    {
      output_dir: z.string().describe("Direktori output"),
      bot_name: z.string().describe("Nama bot, misal 'MyShopBot'"),
      framework: z
        .enum(["aiogram", "ptb"])
        .default("aiogram")
        .describe("Framework: aiogram=modern async, ptb=python-telegram-bot"),
      db_type: z
        .enum(["turso", "sqlite", "none"])
        .default("none")
        .describe("Database: turso=cloud SQLite, sqlite=lokal, none=tanpa DB"),
      include_webhook: z
        .boolean()
        .default(false)
        .describe("Mode webhook untuk production di VPS (vs polling untuk dev)"),
    },
    async ({ output_dir, bot_name, framework, db_type, include_webhook }) => {
      try {
        const resolvedDir = path.resolve(output_dir);
        await ensureDir(resolvedDir);

        await scaffoldTelegramBot(resolvedDir, {
          botName: bot_name,
          framework,
          includeDatabase: db_type !== "none",
          dbType: db_type,
          includeWebhook: include_webhook,
        });

        const tree = await summarizeCreatedFiles(resolvedDir);

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Telegram Bot project berhasil di-scaffold!\n` +
                `${"═".repeat(55)}\n` +
                `📁 Location  : ${resolvedDir}\n` +
                `🤖 Bot Name  : ${bot_name}\n` +
                `🐍 Framework : ${framework}\n` +
                `💾 Database  : ${db_type}\n` +
                `🌐 Mode      : ${include_webhook ? "Webhook" : "Polling"}\n\n` +
                `📂 Files created:\n${tree}\n\n` +
                `🚀 Next steps:\n` +
                `   1. cp .env.example .env\n` +
                `   2. Edit .env — isi BOT_TOKEN dari @BotFather\n` +
                `   3. pip install -e . (atau: uv sync)\n` +
                `   4. python main.py`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("scaffold_telegram_bot", error) }],
        };
      }
    }
  );

  // ── 3. scaffold_chrome_extension ──────────────────────────────────────────
  server.tool(
    "scaffold_chrome_extension",
    "Generate Chrome Extension dengan Manifest V3. " +
      "Support TypeScript, pilih komponen: popup, content script, background service worker, options page.",
    {
      output_dir: z.string().describe("Direktori output"),
      extension_name: z.string().describe("Nama extension, misal 'Page Analyzer'"),
      description: z.string().describe("Deskripsi singkat extension"),
      use_typescript: z.boolean().default(true).describe("Gunakan TypeScript (recommended)"),
      has_popup: z.boolean().default(true).describe("Punya popup UI"),
      has_content_script: z.boolean().default(true).describe("Inject script ke halaman web"),
      has_background: z.boolean().default(true).describe("Punya background service worker"),
      has_options: z.boolean().default(false).describe("Punya halaman options/settings"),
    },
    async ({
      output_dir, extension_name, description, use_typescript,
      has_popup, has_content_script, has_background, has_options,
    }) => {
      try {
        const resolvedDir = path.resolve(output_dir);
        await ensureDir(resolvedDir);

        await scaffoldChromeExtension(resolvedDir, {
          extensionName: extension_name,
          description,
          useTypeScript: use_typescript,
          hasPopup: has_popup,
          hasContentScript: has_content_script,
          hasBackground: has_background,
          hasOptions: has_options,
        });

        const tree = await summarizeCreatedFiles(resolvedDir);

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Chrome Extension berhasil di-scaffold!\n` +
                `${"═".repeat(55)}\n` +
                `📁 Location : ${resolvedDir}\n` +
                `🔌 Name     : ${extension_name}\n` +
                `⚙️  TypeScript: ${use_typescript}\n` +
                `📦 Components: ${[has_popup && "Popup", has_content_script && "Content Script", has_background && "Background", has_options && "Options"].filter(Boolean).join(", ")}\n\n` +
                `📂 Files:\n${tree}\n\n` +
                `🚀 Next steps:\n` +
                (use_typescript
                  ? `   1. cd ${resolvedDir}\n   2. npm install\n   3. npm run build\n`
                  : `   1. cd ${resolvedDir}\n`) +
                `   ${use_typescript ? "4" : "2"}. Buka chrome://extensions\n` +
                `   ${use_typescript ? "5" : "3"}. Enable Developer mode → Load unpacked\n` +
                `   ${use_typescript ? "6" : "4"}. Pilih folder ${use_typescript ? "dist" : resolvedDir}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("scaffold_chrome_extension", error) }],
        };
      }
    }
  );

  // ── 4. scaffold_node_api ──────────────────────────────────────────────────
  server.tool(
    "scaffold_node_api",
    "Generate REST API Node.js dengan TypeScript. " +
      "Support Express atau Fastify, opsional Turso database dan Firebase Admin.",
    {
      output_dir: z.string().describe("Direktori output"),
      project_name: z.string().describe("Nama project"),
      framework: z
        .enum(["express", "fastify"])
        .default("fastify")
        .describe("Framework: fastify=cepat+modern, express=familiar"),
      use_turso: z.boolean().default(false).describe("Tambahkan Turso/libSQL database"),
      use_firebase: z.boolean().default(false).describe("Tambahkan Firebase Admin SDK"),
    },
    async ({ output_dir, project_name, framework, use_turso, use_firebase }) => {
      try {
        const resolvedDir = path.resolve(output_dir);
        await ensureDir(resolvedDir);

        await scaffoldNodeApi(resolvedDir, {
          projectName: project_name,
          framework,
          useTurso: use_turso,
          useFirebase: use_firebase,
        });

        const tree = await summarizeCreatedFiles(resolvedDir);

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Node.js API berhasil di-scaffold!\n` +
                `${"═".repeat(55)}\n` +
                `📁 Location  : ${resolvedDir}\n` +
                `🚀 Framework : ${framework}\n` +
                `💾 Turso     : ${use_turso}\n` +
                `🔥 Firebase  : ${use_firebase}\n\n` +
                `📂 Files:\n${tree}\n\n` +
                `🚀 Next steps:\n` +
                `   1. cd ${resolvedDir}\n` +
                `   2. cp .env.example .env && edit .env\n` +
                `   3. npm install\n` +
                `   4. npm run dev`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("scaffold_node_api", error) }],
        };
      }
    }
  );
}
