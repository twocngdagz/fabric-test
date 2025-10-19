<?php

use Inertia\Testing\AssertableInertia as Assert;

it('renders the canvas page', function () {
    $response = $this->get(route('canvas'));

    $response->assertOk();

    $response->assertInertia(fn (Assert $page) => $page
        ->component('canvas')
    );
});

