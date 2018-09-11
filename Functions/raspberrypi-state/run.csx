using System;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Formatting;
using Microsoft.Azure.Devices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Newtonsoft.Json;

static RegistryManager registryManager;
static ServiceClient serviceClient;
static string connectionString = Environment.GetEnvironmentVariable("iotHubConnectionString");

// Modify the device name for your environment
static string deviceName = "";

public static async Task<HttpResponseMessage> Run(HttpRequestMessage req, TraceWriter log)
{
    HttpResponseMessage response;
    registryManager = RegistryManager.CreateFromConnectionString(connectionString);
    serviceClient = ServiceClient.CreateFromConnectionString(connectionString);
    // parse query parameter
    string action = req.GetQueryNameValuePairs()
        .FirstOrDefault(q => string.Compare(q.Key, "action", true) == 0)
        .Value;
    string name = req.GetQueryNameValuePairs()
        .FirstOrDefault(q => string.Compare(q.Key, "name", true) == 0)
        .Value;
    if (action == "add")
    {
        var methodInvocation = new CloudToDeviceMethod("Add") { ResponseTimeout = TimeSpan.FromSeconds(30) };
        string payload = "{ \"Name\": \"" + name + "\"}";
        methodInvocation.SetPayloadJson(payload);
        var methodResponse = await serviceClient.InvokeDeviceMethodAsync(deviceName, methodInvocation);
        log.Verbose(methodResponse.ToString());
        response = new HttpResponseMessage(HttpStatusCode.OK);
    }
    else if (action == "delete")
    {
        var methodInvocation = new CloudToDeviceMethod("Delete") { ResponseTimeout = TimeSpan.FromSeconds(30) };
        string payload = "{ \"Name\": \"" + name + "\"}";
        methodInvocation.SetPayloadJson(payload);
        var methodResponse = await serviceClient.InvokeDeviceMethodAsync(deviceName, methodInvocation);
        log.Verbose(methodResponse.ToString());
        response = new HttpResponseMessage(HttpStatusCode.OK);
    }
    else if (action == "list")
    {   
        string callback = req.GetQueryNameValuePairs()
            .FirstOrDefault(q => string.Compare(q.Key, "callback", true) == 0)
            .Value;

        if (String.IsNullOrEmpty(callback))
        {
            callback = "callback";
        }
        var methodInvocation = new CloudToDeviceMethod("List") { ResponseTimeout = TimeSpan.FromSeconds(30) };
        var methodResponse = await serviceClient.InvokeDeviceMethodAsync(deviceName, methodInvocation);
        var names = methodResponse.GetPayloadAsJson();
        response = new HttpResponseMessage(HttpStatusCode.OK);
        response.Content = new StringContent(callback + "(" + names + ");", System.Text.Encoding.UTF8, "application/javascript");
    }
    else
    {
        response = new HttpResponseMessage(HttpStatusCode.BadRequest);
    }

    return response;
}
