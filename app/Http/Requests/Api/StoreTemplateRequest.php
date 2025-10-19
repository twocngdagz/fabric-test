<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class StoreTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'canvas_width' => ['required', 'integer', 'min:1', 'max:8192'],
            'canvas_height' => ['required', 'integer', 'min:1', 'max:8192'],
            'elements' => ['required', 'array'],
        ];
    }
}

