<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Http\Request;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Simple named rate limiters for API uploads/exports (Laravel 11/12)
        RateLimiter::for('uploads', function (Request $request) {
            // 10 requests/minute per IP
            return [Limit::perMinute(10)->by($request->ip())];
        });

        RateLimiter::for('exports', function (Request $request) {
            // 20 requests/minute per IP
            return [Limit::perMinute(20)->by($request->ip())];
        });
    }
}
