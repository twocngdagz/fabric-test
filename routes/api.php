<?php

use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\TemplateController;
use App\Http\Controllers\Api\UploadController;
use Illuminate\Support\Facades\Route;

// Laravel 11/12: This file is loaded with the 'api' middleware group and '/api' prefix via Application::withRouting.

// Throttled endpoints for file I/O
Route::post('/upload', [UploadController::class, 'store'])
    ->middleware('throttle:uploads')
    ->name('api.upload');

Route::post('/export', [ExportController::class, 'store'])
    ->middleware('throttle:exports')
    ->name('api.export');

// Templates CRUD
Route::apiResource('templates', TemplateController::class)
    ->parameters(['templates' => 'template'])
    ->names('api.templates');

